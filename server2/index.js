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

function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function manageMarket (market, exchange, pricePoints, priceStep, amount) {
  var ticker = await exchange.fetchTicker(market);

  console.log(ticker.bid, ticker.ask);

  var r = [];
  var newOrders = [];

  for (var i = 0; i < pricePoints; i++) {
    var price = {
      buy: ticker.bid - (priceStep * i),
      sell: ticker.ask + (priceStep * i)
    }

    var buyResponse = exchange.createLimitBuyOrder(market, amount, price.buy);
    var sellResponse = exchange.createLimitSellOrder(market, amount, price.sell);

    console.log(price);

    r.push(buyResponse);
    r.push(sellResponse);

    await wait(120);
  }

  await wait(1000);

  var f = await exchange.fetchClosedOrders(market);

  // console.log(f);

  var orders = _.groupBy(f, 'side');
  var fees = {
    'lastXOrders': 0,
    'BTC': 0,
    'BCH': 0
  };
  // console.log(f[0]);

  for (var side in orders) {
    var o = orders[side];

    // console.log('o', o[0]);

    var fTotalIncome = _.reduce(o, (agg, oo) => agg + parseFloat(oo.info.fees_income), 0);
    var fTotalFees = _.reduce(o, (agg, oo) => agg - parseFloat(oo.info.fill_fees), 0);

    fees[side === 'sell' ? 'BCH' : 'BTC'] += fTotalIncome;
    fees[side === 'sell' ? 'BTC' : 'BCH'] += fTotalFees;

    fees['lastXOrders'] += o.length;
    // console.log('o', side === 'sell' ? 'BCH' : 'BTC', fTotalIncome);
    // console.log('o', side === 'sell' ? 'BTC' : 'BCH', fTotalFees);
  }

  console.log({fees});

  _.forEach(r, p => p.then(value => newOrders.push(value)).catch(e => console.error(e)));

  var w = await Promise.all(r)
                       .catch(e => console.error('manageMarket error', e));

  console.log(_.map(w, a => a.info.status));
}

async function cancelAllOrders(exchange, orders) {
  for (var index in orders) {
    console.log(index, orders[index]);
    try {
      await exchange.cancelOrder(orders[index].id);
    }
    catch (e) {}
  }
}

(async function () {
  // console.log(ccxt.exchanges);

  var  fcoin = new ccxt.fcoin({apiKey: fcoin_api_key, secret: fcoin_secret})
      ,gdax = new ccxt.gdax({apiKey: coinbase_api_key, secret: coinbase_secret, password: coinbase_passphrase})
      ,coss = new ccxt.coss({apiKey: coss_api_key, secret: coss_secret});
      //,coinbene = new ccxt.coinbene({apiKey: coinbene_api_key, secret: coinbene_secret})
      //,idcm = new ccxt.idcm({apiKey: idcm_api_key, secret: idcm_secret});

  var apis = {fcoin, gdax/*, coinbene, idcm*/};

  var openOrders = await fcoin.fetchOpenOrders('BCH/BTC');

  await cancelAllOrders(fcoin, openOrders);


  while (true) {
    await manageMarket('BCH/BTC', fcoin, 3, 0.00001, 0.02);

    await wait(20 * 1000);
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