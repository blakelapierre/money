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

var config = {
  'fcoin': {
    'BTC/USDT': {
      trade: true,
      priceStep: 0.0001,
      tradeAmount: 0.01
    }
    ,'BCH/USDT': {
      trade: true,
      priceStep: 0.1,
      tradeAmount: 0.1
    }
    ,'BCH/BTC': {
      trade: true,
      priceStep: 0.1,
      tradeAmount: 0.1
    }
    ,'BTC/TUSD': {
      trade: false,
      priceStep: 0.1,
      tradeAmount: 0.01
    }
    ,'BTC/USDC': {
      trade: false,
      priceStep: 0.1,
      tradeAmount: 0.01
    }
    ,'USDC/USDT': {
      trade: false,
      priceStep: 0.0001,
      tradeAmount: 100
    }
    ,'TUSD/USDT': {
      trade: false,
      priceStep: 0.0001,
      tradeAmount: 100
    }
    ,'PAX/USDT': {
      trade: false,
      priceStep: 0.0001,
      tradeAmount: 100
    }
    ,'FT/PAX': {
      trade: false,
      priceStep: 0.001,
      tradeAmount: 400
    }
  }
};

var marketMap = {
  'bchusdt': 'BCH/USDT',
  'btcusdt': 'BTC/USDT',
  'bchbtc': 'BCH/BTC'
};

var lastPrices = {};

(async function (symbols) {
  var pairs = _.map(symbols, symbol => symbol.split('/').join('').toLowerCase());

  watchTickers(pairs);
})(Object.keys(_.pickBy(config['fcoin'], value => value.trade)));

var stop;

function watchTickers (markets) {
  var tickers = _.map(markets, m => `ticker.${m}`);

  var fcoinWs = new ws('wss://api.fcoin.com/v2/ws');

  fcoinWs.on('open', () => {
    console.log('fcoin ws open');

    setInterval(() => {
      if (fcoinWs.readyState === 1) {
        console.log('ping');
        fcoinWs.send(JSON.stringify({'cmd': 'ping', 'args': [new Date ().getTime()]}));
      }
      else {
        stop = true;
        console.error('ERROR! WS NOT READY!!');
      }
    }, 20 * 1000);

    fcoinWs.send(
      JSON.stringify({
        'cmd': 'sub',
        'args': tickers
      })
    );

    manage();
  });

  fcoinWs.on('close', () => {
    console.error('****!!!!ERROR!!!!**** WS CLOSED!');
  });

  fcoinWs.on('message', message => {
    var data = JSON.parse(message);

    if (data.type && data.type.indexOf('ticker.') === 0) {
      var parts = data.type.split('.');
      var ticker = parts[1];
      var market = marketMap[ticker];

      var ask = data.ticker[4];
      var bid = data.ticker[2];

      lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};

      var lastAsk = lastPrices[market].ask;
      var lastBid = lastPrices[market].bid;

      if (lastAsk === ask && lastBid === bid) return;

      lastPrices[market].ask = ask;
      lastPrices[market].bid = bid;

      console.log(market, lastPrices[market]);
    }
    else console.error('!!! UNKNOWN response', data);
  });
}


var  fcoin = new ccxt.fcoin({apiKey: fcoin_api_key, secret: fcoin_secret})
    ,gdax = new ccxt.gdax({apiKey: coinbase_api_key, secret: coinbase_secret, password: coinbase_passphrase})
    ,coss = new ccxt.coss({apiKey: coss_api_key, secret: coss_secret});
    //,coinbene = new ccxt.coinbene({apiKey: coinbene_api_key, secret: coinbene_secret})
    //,idcm = new ccxt.idcm({apiKey: idcm_api_key, secret: idcm_secret});

var apis = {fcoin, gdax/*, coinbene, idcm*/};

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
}

function handleFCoinOrderError (error) {
  var json = error.message.substr('fcoin '.length);

  var data = JSON.parse(json);

  if (data.status === 1016) console.error('!!FCOIN Account Balance Insufficient!!');
  else if (data.status === 1002) console.error('!!FCOIN System Busy!!')

  // console.error('fcoin error+!!!', data);
}

async function checkClosedOrders (exchange, market) {
  var symbols = market.split('/');

  console.log(Object.keys(outstandingOrders).length, 'outstanding orders');

  try {
    var f = await exchange.fetchClosedOrders(market, undefined, undefined, {states: ['filled', 'partial_filled', 'partial_canceled']});

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

      _.forEach(o, oo => (delete outstandingOrders[oo.id]));
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
  }
  catch (e) {
    console.error ('Error checking closed orders', market, e);
  }
}

const outstandingOrders = {};

function recordBuyOrder (market, amount, price) {
  return data => {
    console.log(market, 'BUY ', amount, '@', price);
    outstandingOrders[data.id] = true;
  };
}

function recordSellOrder (market, amount, price) {
  return data => {
    console.log(market, 'SELL', amount, '@', price);
    outstandingOrders[data.id] = true;
  };
}

async function manageMarketPercent (market, exchange, pricePoints, priceStep, amount) {
  console.log('*** MANAGING', market);

  // var ticker = await exchange.fetchTicker(market);
  var ticker;

  var symbols = market.split('/');

  var r = [];
  var newOrders = [];

  var prevBuyResponse, prevSellReponse;

  for (var i = 0; i < pricePoints; i++) {
    ticker = lastPrices[market];
    console.log(market, {ticker});

    var buy= ticker.bid - (priceStep * i);
    var sell = ticker.ask + (priceStep * (i));

    var buyResponse = exchange.createLimitBuyOrder(market, amount, buy).then(recordBuyOrder(market, amount, buy)).catch(handleFCoinOrderError);
    var sellResponse = exchange.createLimitSellOrder(market, amount, sell).then(recordSellOrder(market, amount, sell)).catch(handleFCoinOrderError);

    if (prevBuyResponse) await prevBuyResponse;
    if (prevSellReponse) await prevSellReponse;

    prevBuyResponse = buyResponse;
    prevSellReponse = sellResponse;

    // console.log({buy, sell});

    r.push(buyResponse);
    r.push(sellResponse);
  }

  for (var i = 1; i < pricePoints / 2; i++) {
    ticker = lastPrices[market];
    console.log(ticker.bid, ticker.ask);

    var buy = ticker.bid - (0.01 * i * ticker.bid);
    var sell = ticker.ask + (priceStep * 2) + (0.01 * i * ticker.ask);

    var buyResponse = exchange.createLimitBuyOrder(market, amount, buy).then(recordBuyOrder(market, amount, buy)).catch(handleFCoinOrderError);
    var sellResponse = exchange.createLimitSellOrder(market, amount, sell).then(recordSellOrder(market, amount, sell)).catch(handleFCoinOrderError);

    if (prevBuyResponse) await prevBuyResponse;
    if (prevSellReponse) await prevSellReponse;

    prevBuyResponse = buyResponse;
    prevSellReponse = sellResponse;

    // console.log({buy, sell});

    r.push(buyResponse);
    r.push(sellResponse);
  }

  try {
    _.forEach(r, p => p.then(value => newOrders.push(value)).catch(e => {
      if (e.status === 1016) console.error(e.msg);
      else console.error(e);
    }));
  }
  catch (e) {
    console.error('##### Error manageMarketPercent', e);
  }
}

function cancelOrder(exchange, id) {
  return exchange.cancelOrder(id).then(() => delete outstandingOrders[id]);
}

async function cancelAllOrders(exchange, orders) {
  for (let i = 0; i < orders.length; i += 3) {
    var o = orders[i];
    var r = [];
    console.log('cancelling', i + 1, '/', orders.length, o.symbol, o.side, o.price, o.amount, o.id);
    try {
      r.push(cancelOrder(exchange, o.id));
    }
    catch (e) {}

    if ((i + 1) < orders.length) {
      o = orders[i + 1];
      console.log('cancelling', i + 2, '/', orders.length, o.symbol, o.side, o.price, o.amount, o.id);
      try {
        r.push(cancelOrder(exchange, o.id));
      }
      catch (e) {}
    }

    if ((i + 2) < orders.length) {
      o = orders[i + 2];
      console.log('cancelling', i + 3, '/', orders.length, o.symbol, o.side, o.price, o.amount, o.id);
      try {
        r.push(cancelOrder(exchange, o.id));
      }
      catch (e) {}
    }

    await Promise.all(r).catch(e => console.error('error cancelling order', e));
  }
}

async function manage () {

  var openOrders;

  setInterval(async function() {
    await checkClosedOrders(fcoin, 'BCH/BTC');
    await checkClosedOrders(fcoin, 'BCH/USDT');
    await checkClosedOrders(fcoin, 'BTC/USDT');
  }, 20 * 1000);

  while (!stop) {
    try {
      openOrders = await fcoin.fetchOpenOrders('BCH/BTC');
      await cancelAllOrders(fcoin, openOrders);
      await manageMarketPercent('BCH/BTC', fcoin, 4, 0.00001, 0.2);

      await wait (200);

      openOrders = await fcoin.fetchOpenOrders('BCH/USDT');
      await cancelAllOrders(fcoin, openOrders);
      await manageMarketPercent('BCH/USDT', fcoin, 4, 0.1, 0.2);

      await wait (200);

      openOrders = await fcoin.fetchOpenOrders('BTC/USDT');
      await cancelAllOrders(fcoin, openOrders);
      await manageMarketPercent('BTC/USDT', fcoin, 5, 0.1, 0.01);

      await wait(2 * 1000);

      await manageMarketPercent('BCH/BTC', fcoin, 4, 0.00001, 0.2);

      await wait (200);

      await manageMarketPercent('BCH/USDT', fcoin, 4, 0.1, 0.2);

      await wait (200);

      await manageMarketPercent('BTC/USDT', fcoin, 5, 0.1, 0.01);

      await wait(10 * 1000);
    }
    catch (e) {}
  }
}

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