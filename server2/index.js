var fs = require('fs');

var ws = require('ws');

var ccxt = require('ccxt');
var _ = require('lodash');

var {fcoin_api_key, fcoin_secret} = process.env;
var {coinbase_api_key, coinbase_secret, coinbase_passphrase} = process.env;
var {coss_api_key, coss_secret} = process.env;
var {coinbene_api_key, coinbene_secret} = process.env;
var {idcm_api_key, idcm_secret} = process.env;

var tickers = {
  'fcoin': ['BTC/USDT'/*, 'BCH/BTC', 'FT/ETH'*/]//,
  // 'gdax': ['BTC/USDC', 'BTC/USD', 'BCH/BTC']
};


var routes = [
  ['fcoin:USDT', 'fcoin:ETH', 'gdax:ETH', 'gdax:USDC'],
  ['fcoin:USDT', 'fcoin:BTC', 'gdax:BTC', 'gdax:USDC'],
  ['fcoin:USDT', 'fcoin:XLM', 'gdax:XLM', 'gdax:BTC', 'gdax:USDC'],
  ['fcoin:USDT', 'fcoin:XLM', 'gdax:XLM', 'gdax:ETH', 'gdax:USDC'],
];

// async function makeMarket(pair, )


var  fcoin = new ccxt.fcoin({apiKey: fcoin_api_key, secret: fcoin_secret})
    ,gdax = new ccxt.gdax({apiKey: coinbase_api_key, secret: coinbase_secret, password: coinbase_passphrase})
    ,coss = new ccxt.coss({apiKey: coss_api_key, secret: coss_secret});
    //,coinbene = new ccxt.coinbene({apiKey: coinbene_api_key, secret: coinbene_secret})
    //,idcm = new ccxt.idcm({apiKey: idcm_api_key, secret: idcm_secret});

var apis = {fcoin, gdax/*, coinbene, idcm*/};

// var fcoinWs = new ws('wss://api.fcoin.com/v2/ws');

// fcoinWs.on('open', () => {
//   console.log('fcoin ws open');

//   fcoinWs.send(JSON.stringify({'cmd': 'sub', args: ['ticker.btcusdt']}))
// });

// fcoinWs.on('message', message => {
//   // console.log('fcoin message', message.toString());

//   var data = JSON.parse(message);

//   switch (data.type) {
//     case 'ticker.btcusdt':
//       var ask = data.ticker[4];
//       var bid = data.ticker[2];

//       console.log('btc/usdt', ask, bid);

//       makeOrders ('BTC/USDT', fcoin, 4, 0.01, 0.0025, ask, bid);
//   }
// });

var lastAsk = 0, lastBid = 0;

function makeOrders (market, exchange, pricePoints, priceStep, amount, ask, bid) {
  if (lastAsk === ask && lastBid === bid) return;

  lastAsk = ask;
  lastBid = bid;

  for (var i = 0; i < pricePoints; i++) {
    var step = priceStep * i;

    var price = {
      buy: ask + step,
      sell: bid + step
    };

    console.log({pricePoints, priceStep, step, price});

    var buyResponse = exchange.createLimitBuyOrder(market, amount, price.buy)
                              .then(() => console.log('buy', market, amount, price.buy))
                              .catch(e => console.log('error buying', market, amount, price.buy, e));

    var sellResponse = exchange.createLimitSellOrder(market, amount, price.sell)
                               .then(() => console.log('sell', market, amount, price.sell))
                               .catch(e => console.log('error selling', market, amount, price.sell, e));
  }
}

function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

var filledOrders = {};

function recordFilledOrders (orders) {
  var symbol = orders[0].info.symbol;

  var symbolOrders = (filledOrders[symbol] = filledOrders[symbol] || {});

  for (var i = 0; i < orders.length; i++) {
    var order = orders[i];

    var existing = symbolOrders[order.id];

    if (!existing) {
      symbolOrders[order.id] = true;

      fs.appendFile(symbol, `${JSON.stringify(order)}\n`, error => {
        if (error) console.error('error writing order to', symbol, error);
      });
    }
  }
  // console.log('record', orders[0]);
}

async function manageMarket (market, exchange, pricePoints, priceStep, amount) {
  console.log('*** MANAGING', market);

  var ticker = await exchange.fetchTicker(market);

  console.log(ticker.bid, ticker.ask);

  var symbols = market.split('/');

  var r = [];
  var newOrders = [];

  var prevBuyResponse, prevSellReponse;

  for (var i = 0; i < pricePoints; i++) {
    var price = {
      buy: ticker.bid - (priceStep * i),
      sell: ticker.ask + (priceStep * 2) + (priceStep * i)
    }

    var buyResponse = exchange.createLimitBuyOrder(market, amount, price.buy).catch(error => console.log('buy error', error.message));
    var sellResponse = exchange.createLimitSellOrder(market, amount, price.sell).catch(error => console.log('sell error', error.message));

    if (prevBuyResponse) await prevBuyResponse;
    if (prevSellReponse) await prevSellReponse;

    prevBuyResponse = buyResponse;
    prevSellReponse = sellResponse;

    console.log(price);

    r.push(buyResponse);
    r.push(sellResponse);

    // // await wait(200);
    // await buyResponse;
    // await sellResponse;
  }

  await wait(300);

  try {
    var f = await exchange.fetchClosedOrders(market, undefined, undefined, {states: ['filled', 'partial_filled', 'partial_canceled']});

    // recordFilledOrders(f);

    var duration = (f[f.length - 1].timestamp - f[0].timestamp) / 1000 / 60;

    var orders = _.groupBy(f, 'side');
    var transactionAmounts = {
      'sell': 0,
      'buy': 0
    };
    var fees = {
      duration,
      'lastXOrders': 0,
      [symbols[0]]: 0,
      [symbols[1]]: 0
    };

    for (var side in orders) {
      var o = orders[side];

      transactionAmounts[side] = _.reduce(o, (agg, oo) => agg + parseFloat(oo.price) * parseFloat(oo.amount), 0);

      var fTotalIncome = _.reduce(o, (agg, oo) => agg + parseFloat(oo.info.fees_income), 0);
      var fTotalFees = _.reduce(o, (agg, oo) => agg - parseFloat(oo.info.fill_fees), 0);

      fees[side === 'sell' ? symbols[0] : symbols[1]] += fTotalIncome;
      fees[side === 'sell' ? symbols[1] : symbols[0]] += fTotalFees;

      fees['lastXOrders'] += o.length;
    }

    fees['estimatedDailyRate'] = {
      [symbols[1]]: (24 * 60) / duration * fees[symbols[1]],
      [symbols[0]]: (24 * 60) / duration * fees[symbols[0]]
    };

    var tradeGain = transactionAmounts['sell'] - transactionAmounts['buy'];
    var estimatedDailyTradeGain = tradeGain * ((24 * 60) / duration);

    console.log({fees, transactionAmounts, tradeGain, estimatedDailyTradeGain});

    fs.appendFile('log', `${JSON.stringify({time: new Date(), fees, transactionAmounts, tradeGain, estimatedDailyTradeGain})}\n`, error => {
      if (error) console.error('log append error', error);
    });

    _.forEach(r, p => p.then(value => newOrders.push(value)).catch(e => {
      if (e.status === 1016) console.error(e.msg);
      else console.error(e);
    }));
  }
  catch (e) {}

  // var w = await Promise.all(r)
  //                      .catch(e => {
  //                         if (e.status === 1016) console.error(e.msg);
  //                         else console.error(e.msg);
  //                         // console.error('manageMarket error', e);
  //                       });

  // console.log(_.map(w, a => a.info.status));
}

async function cancelAllOrders(exchange, orders) {
  for (let i = 0; i < orders.length; i += 3) {
    var o = orders[i];
    var r = [];
    console.log('cancelling', i + 1, '/', orders.length, o.symbol, o.side, o.price, o.amount, o.id);
    try {
      r.push(exchange.cancelOrder(orders[i].id));
    }
    catch (e) {}

    if ((i + 1) < orders.length) {
      o = orders[i + 1];
      console.log('cancelling', i + 2, '/', orders.length, o.symbol, o.side, o.price, o.amount, o.id);
      try {
        r.push(exchange.cancelOrder(o.id));
      }
      catch (e) {}
    }

    if ((i + 2) < orders.length) {
      o = orders[i + 2];
      console.log('cancelling', i + 3, '/', orders.length, o.symbol, o.side, o.price, o.amount, o.id);
      try {
        r.push(exchange.cancelOrder(o.id));
      }
      catch (e) {}
    }

    await Promise.all(r).catch(e => console.error('error cancelling order', e));
  }
  // for (var index in orders) {
  //   var o = orders[index];
  //   console.log('cancelling', parseInt(index) + 1, '/', orders.length, o.symbol, o.side, o.price, o.amount, o.id);
  //   try {
  //     await exchange.cancelOrder(orders[index].id);
  //   }
  //   catch (e) {}
  // }
}

(async function () {
  // console.log(ccxt.exchanges);

  // var openOrders = await fcoin.fetchOpenOrders('BCH/BTC');

  // await cancelAllOrders(fcoin, openOrders);


  // while (true) {
  //   var openOrders = await fcoin.fetchOpenOrders('BCH/BTC');

  //   await cancelAllOrders(fcoin, openOrders);

  //   await manageMarket('BCH/BTC', fcoin, 3, 0.00001, 0.2);

  //   await wait(20 * 1000);

  //   await manageMarket('BCH/BTC', fcoin, 3, 0.00001, 0.2);

  //   await wait(20 * 1000);
  // }

  while (true) {
    var openOrders = await fcoin.fetchOpenOrders('BCH/BTC');
    await cancelAllOrders(fcoin, openOrders);
    await manageMarket('BCH/BTC', fcoin, 4, 0.00001, 0.1);

    await wait (200);

    openOrders = await fcoin.fetchOpenOrders('BCH/USDT');
    await cancelAllOrders(fcoin, openOrders);
    await manageMarket('BCH/USDT', fcoin, 4, 0.02, 0.1);

    await wait (200);

    openOrders = await fcoin.fetchOpenOrders('BTC/USDT');
    await cancelAllOrders(fcoin, openOrders);
    await manageMarket('BTC/USDT', fcoin, 5, 0.02, 0.005);

    await wait (200);

    openOrders = await fcoin.fetchOpenOrders('ETH/USDT');
    await cancelAllOrders(fcoin, openOrders);
    await manageMarket('ETH/USDT', fcoin, 5, 0.02, 0.15);

    await wait (200);

    openOrders = await fcoin.fetchOpenOrders('EOS/USDT');
    await cancelAllOrders(fcoin, openOrders);
    await manageMarket('EOS/USDT', fcoin, 5, 0.02, 6);

    await wait (200);

    openOrders = await fcoin.fetchOpenOrders('LTC/USDT');
    await cancelAllOrders(fcoin, openOrders);
    await manageMarket('LTC/USDT', fcoin, 5, 0.02, 0.42);

    await wait(200);

    openOrders = await fcoin.fetchOpenOrders('FT/USDT');
    await cancelAllOrders(fcoin, openOrders);
    await manageMarket('FT/USDT', fcoin, 3, 0.0001, 100);

    await wait(7 * 1000);


    await manageMarket('BCH/BTC', fcoin, 4, 0.00001, 0.1);

    await wait (200);

    await manageMarket('BCH/USDT', fcoin, 4, 0.02, 0.1);

    await wait (200);

    await manageMarket('BTC/USDT', fcoin, 5, 0.02, 0.005);

    await wait (200);

    await manageMarket('ETH/USDT', fcoin, 5, 0.02, 0.15);

    await wait (200);

    await manageMarket('EOS/USDT', fcoin, 5, 0.02, 6);

    await wait (200);

    await manageMarket('LTC/USDT', fcoin, 5, 0.02, 0.42);

    await wait(200);

    await manageMarket('FT/USDT', fcoin, 3, 0.0001, 100);

    await wait(7 * 1000);
  }

  // var btcusdt = await fcoin.fetchTicker('BTC/USDT');

  // console.log(btcusdt.bid, btcusdt.ask);

  // var r = [];
  // var amount = 0.01;
  // var waitTime = 30;
  // for (var i = 0; i < 5; i++) {
  //   var price = btcusdt.bid - (0.10 * i);
  //   var b = fcoin.createLimitBuyOrder('BTC/USDT', amount, price);
  //   console.log('buy', price, b);
  //   price = btcusdt.ask + (0.10 * i);
  //   var s = fcoin.createLimitSellOrder('BTC/USDT', amount, price);
  //   await wait(waitTime);
  //   console.log('sell', price, s);

  //   r.push(b);
  //   r.push(s);
  // }

  // console.log(r);

  // for (var exchange in tickers) {
  //   var pairs = tickers[exchange];

  //   for (var index in pairs) {
  //     var pair = pairs[index];

  //     var r = await apis[exchange].fetchTicker(pair);

  //     console.log(exchange, pair, r.bid, r.ask);
  //   }
  // }

  // var balances = {
  //    fcoin: await fcoin.fetchBalance()
  //   ,gdax: await gdax.fetchBalance()
  //   ,coss: await coss.fetchBalance()
  //   //,coinbene: await coinbene.fetchBalance()
  //   //,idcm: await idcm.fetchBalance()
  // };

  // //var fcoinBalance = await fcoin.fetchBalance();

  // console.log('fcoin balance FT', balances['fcoin']['FT']);
  // console.log('fcoin balance ETH', balances['fcoin']['ETH']);

  // console.log(balances);


  // var b = {};

  // for (var exchange in balances) {
  //   var total = balances[exchange].total;

  //   for (var coin in total) {
  //     var value = total[coin];

  //     b[coin] = (b[coin] || 0) + value;
  //   }
  // }

  // console.log(_.pickBy(b, value => value > 0));


  // console.log('fcoin balance BCH', fcoinBalance['BCH']);



  //var fcoinOrders = await fcoin.fetchOrders('FT/BTC');
  //console.log('fcoin orders FT/BTC', _.map(fcoinOrders, order => [order.side, order.status, order.price, order.amount, order.filled, order.info.fees_income]));

  // _.forEach(tickers, (pairs, exchange) => {
  //   _.forEach(pairs, pair => {
  //     var r = await apis[exchange].fetchTicker(pair);

  //     console.log(exchange, pair, r);
  //   });
  // });


  // var markets = {
  //   fcoin: await fcoin.loadMarkets(),
  //   gdax: await gdax.loadMarkets()
  // };

  // console.log('markets', markets);
  // console.log('exchanges', Object.keys(markets));

  // var cross = crossMarkets(markets);
  // // console.log('cross markets', cross);

  // var usdT2C = [];

  // for (let i = 0; i < cross.length; i++) {
  //   var c = cross[i];

  //   if (
  //     // c[2] === 'USDT' || c[2] === 'USDC' || c[4] === 'USDT' || c[4] === 'USDC'
  //     // c[2] === 'USDT'
  //     // (c[2] === 'USDT' && c[4] === 'USDC')
  //     (c[2] === 'USDT') &&
  //     (c[4] === 'USDC')
  //   ) {
  //     // console.log('c', c);
  //     usdT2C.push(c);
  //   }
  // }

  // // console.log('usdT2C', usdT2C);

  // _.forEach(usdT2C, c => console.log('usdT2C', c));

  // // console.log('find', findMarkets('USDT', markets));
  // var fcoinUSDTMarkets = findMarketsInExchange('fcoin', 'USDT', markets);
  // var gdaxUSDCMarkets = findMarketsInExchange('gdax', 'USDC', markets);

  // _.forEach(fcoinUSDTMarkets, m => console.log('m', m));

  // console.log('find', fcoinUSDTMarkets);
  // console.log('find', gdaxUSDCMarkets);
})();

function findMarketsInExchange (exchange, coin, markets) {
  var f = pair => pair.quote === coin || pair.base === coin;

  return _.map(_.filter(markets[exchange], f), pair => [exchange, pair.quote, pair.base, pair.symbol]);
}

function findMarkets (coin, markets) {
  var f = pair => pair.quote === coin || pair.base === coin;

  return _.flatMap(
            _.map(markets,
              (exchange, name) =>
                _.map(_.filter(exchange, f), pair => [name, pair.quote, pair.base])));
}

function crossMarkets (markets) {
  var cross = [];

  for (var name in markets) {
    var m1 = markets[name];

    // for (var p1 in m1) {
    //   cross.push([name, name, m1[p1].base, '->', m1[p1].quote]);
    //   cross.push([name, name, m1[p1].quote, '->', m1[p1].base]);
    // }

    for (var otherName in markets) {
      if (name === otherName) continue;

      var m2 = markets[otherName];

      for (var p1 in m1) {
        var pair1 = m1[p1];

        if (!pair1.active) continue;

        for (var p2 in m2) {
          var pair2 = m2[p2];

          if (!pair2.active) continue;

          if (pair1.base === pair2.quote) {
            cross.push([name, otherName, pair1.quote, `->${pair1.base}`, pair2.base, p1, p2, pair1.taker + pair2.taker, pair1.maker + pair2.maker]);
          }
          else if (pair1.quote === pair2.base) {
            cross.push([name, otherName, pair1.base, `->${pair1.quote}`, pair2.quote, p1, p2, pair1.taker + pair2.taker, pair1.maker + pair2.maker]);
          }
          else if (pair1.base === pair2.base) {
            cross.push([name, otherName, pair1.quote, `->${pair1.base}`, pair2.quote, p1, p2, pair1.taker + pair2.taker, pair1.maker + pair2.maker]);
          }
          else if (pair1.quote === pair2.quote) {
            cross.push([name, otherName, pair1.base, `->${pair1.quote}`, pair2.base, p1, p2, pair1.taker + pair2.taker, pair1.maker + pair2.maker]);
          }
        }
      }
    }
  }

  return cross;
}