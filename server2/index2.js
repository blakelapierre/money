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
      tradeAmount: 0.02
    }
    ,'BCH/USDT': {
      trade: true,
      priceStep: 0.1,
      tradeAmount: 0.25
    }
    ,'BCH/BTC': {
      trade: true,
      priceStep: 0.1,
      tradeAmount: 0.25
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
    ,'ETH/USDT': {
      trade: true,
      priceStep: 0.1,
      tradeAmount: 0.5
    }
    ,'EOS/USDT': {
      trade: true,
      priceStep: 0.001,
      tradeAmount: 15
    }
    ,'LTC/USDT': {
      trade: true,
      priceStep: 0.01,
      tradeAmount: 1
    }
  }
};

var marketMap = {
  'bchusdt': 'BCH/USDT',
  'btcusdt': 'BTC/USDT',
  'bchbtc': 'BCH/BTC',
  'ethusdt': 'ETH/USDT',
  'eosusdt': 'EOS/USDT',
  'ltcusdt': 'LTC/USDT'
};

var lastPrices = {};

const getTradeable = exchangeName => _.pickBy(config[exchangeName], value => value.trade);

(async function (symbols) {
  var pairs = _.map(symbols, symbol => symbol.split('/').join('').toLowerCase());

  watchTickers(pairs);
})(Object.keys(getTradeable('fcoin')));

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

      try {
        console.log('trying to update', market);
        //updateOrders(market, {ask, bid, lastAsk, lastBid}).catch(e => console.error('Error updating orders', market, e));
      }
      catch (e) {
        console.error('error updating orders', market, e);
      }

      console.log(market, lastPrices[market]);
    }
    else console.error('!!! UNKNOWN response', data);
  });
}

async function updateOrders (market, {ask, bid, lastAsk, lastBid}) {
  var noMargin = market === 'BCH/BTC';
  var priceStep = config['fcoin'][market].priceStep;
  var amount = config['fcoin'][market].tradeAmount;

  var currentOrdersByPrice = outstandingOrdersByPrice['fcoin'][market];

  if (lastAsk !== 0 && ask - lastAsk < 0) {
    // fill in new sells
    console.log('Updating', market, 'sells', {ask, lastAsk});
    var sellResponse, marginSellResponse, prevSellResponse, prevMarginSellResponse;
    for (let price = ask; price < lastAsk; price += priceStep) {
      if (!(currentOrdersByPrice && currentOrdersByPrice.sell[price])) sellResponse = fcoin.createLimitSellOrder(market, amount, price).then(recordSellOrder(market, amount, price)).catch(handleFCoinOrderSellError);
      if (!noMargin && !(currentOrdersByPrice && currentOrdersByPrice.marginSell[price])) marginSellResponse = fcoin.createLimitSellOrder(market, amount * 2, price, {'account_type': 'margin'}).then(recordSellOrder(market, amount, price, true)).catch(handleFCoinOrderSellError);
      
      if (prevSellResponse) await prevSellResponse;
      if (prevMarginSellResponse) await prevMarginSellResponse;

      await wait (200);

      prevSellResponse = sellResponse;
      prevMarginSellResponse = marginSellResponse;
    }
  }

  if (lastBid !== 0 && bid - lastBid > 0) {
    // fill in new buys
    console.log('Updating', market, 'bids', {bid, lastBid});
    var buyResponse, marginBuyResponse, prevBuyResponse, prevMarginBuyResponse;
    for (let price = bid; price > lastBid; price -= priceStep) {
      if (!(currentOrdersByPrice && currentOrdersByPrice.buy[price])) buyResponse = fcoin.createLimitBuyOrder(market, amount, price).then(recordSellOrder(market, amount, price)).catch(handleFCoinOrderBuyError);
      if (!noMargin && !(currentOrdersByPrice && currentOrdersByPrice.marginBuy[price])) marginBuyResponse = fcoin.createLimitBuyOrder(market, amount * 2, price, {'account_type': 'margin'}).then(recordBuyOrder(market, amount, price, true)).catch(handleFCoinOrderBuyError);

      if (prevBuyResponse) await prevBuyResponse;
      if (prevMarginBuyResponse) await prevMarginBuyResponse;

      await wait (200);

      prevBuyResponse = buyResponse;
      prevMarginBuyResponse = marginBuyResponse;
    }
  }
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

     /* fs.appendFile(symbol, `${JSON.stringify(order)}\n`, error => {
        if (error) console.error('error writing order to', symbol, error);
      });*/
    }
  }
}

function handleFCoinOrderBuyError (error) {
  var json = error.message.substr('fcoin '.length);

  try {
    var data = JSON.parse(json);

    if (data.status === 1016) console.error('!!FCOIN Account Balance Insufficient to Buy!!');
    else if (data.status === 1002) console.error('!!FCOIN System Busy!!');
    else if (data.status === 429) {
      console.error('api limit!!');
//      await wait (1000);
    }
    else console.error('fcoin error+!!!', data);
  }
  catch (e) { console.error('error parsing json', json, error, e); }
}

function handleFCoinOrderSellError (error) {
  var json = error.message.substr('fcoin '.length);

  try {
    var data = JSON.parse(json);

    if (data.status === 1016) console.error('!!FCOIN Account Balance Insufficient to Sell!!');
    else if (data.status === 1002) console.error('!!FCOIN System Buys!!');
    else if (data.staus === 429) {
      console.error('api limit!!');
//      await wait (1000);
    }
    else console.error('fcoin error+!!!', data);
  }
  catch (e) { console.error('error parsing json', json, error, e); }
}

async function checkClosedOrders (exchange, market, margin) {
  var symbols = market.split('/');

  try {
    var f = await exchange.fetchOrders(market, undefined, undefined, {states: 'filled,partial_filled,partial_canceled', 'account_type': margin ? 'margin' : undefined});

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

    
    console.log(Object.keys(outstandingOrders).length, 'outstanding orders');

    return {fees, transactionAmounts, tradeGain, estimatedDailyTradeGain};

    /*fs.appendFile('log', `${JSON.stringify({time: new Date(), fees, transactionAmounts, tradeGain, estimatedDailyTradeGain})}\n`, error => {
      if (error) console.error('log append error', error);
    });*/
  }
  catch (e) {
    console.error ('Error checking closed orders', market, e);
  }
}

const outstandingOrders = {};
const outstandingOrdersByPrice = {'fcoin': {}};

function recordBuyOrder (market, amount, price, margin) {
  return data => {
    console.log(market, 'BUY ', amount, '@', price);
    outstandingOrders[data.id] = true;
    outstandingOrdersByPrice['fcoin'][market] = outstandingOrdersByPrice['fcoin'][market] || {buy: {}, sell: {}, marginBuy: {}, marginSell: {}};
    outstandingOrdersByPrice['fcoin'][market][margin ? 'marginBuy' : 'buy'][price] = data;
  };
}

function recordSellOrder (market, amount, price, margin) {
  return data => {
    console.log(market, 'SELL', amount, '@', price);
    outstandingOrders[data.id] = true;
    outstandingOrdersByPrice['fcoin'][market] = outstandingOrdersByPrice['fcoin'][market] || {buy: {}, sell: {}, marginBuy: {}, marginSell: {}};
    outstandingOrdersByPrice['fcoin'][market][margin ? 'marginSell' : 'sell'][price] = data;
  };
}

async function manageMarketPercent (market, exchange, pricePoints, priceStep, amount) {
  console.log('*** MANAGING', market);

  // var ticker = await exchange.fetchTicker(market);
  var ticker = lastPrices[market];
  if (!ticker) return;

  var symbols = market.split('/');

  var r = [];
  var newOrders = [];

  var noMargin = market === 'BCH/BTC';

  var prevBuyResponse, prevMarginBuyResponse, prevSellReponse, prevMarginSellResponse,
      buyResponse, marginBuyResponse, sellResponse, marginSellResponse;

  var currentOrdersByPrice = outstandingOrdersByPrice['fcoin'][market];

  var marginMultiplier = market === 'BTC/USDT' ? 7 : (market === 'BCH/USDT' ? 15 : (market === 'ETH/USDT' ? 3 : 1.5));

  for (var i = 0; i < pricePoints; i++) {
    console.log(market, {ticker});

    var buy = ticker.bid - (priceStep * i);
    var sell = ticker.ask + (priceStep * (i));

    if (!(currentOrdersByPrice && currentOrdersByPrice.buy[buy])) buyResponse = exchange.createLimitBuyOrder(market, amount, buy).then(recordBuyOrder(market, amount, buy)).catch(handleFCoinOrderBuyError);
    if (!noMargin && !(currentOrdersByPrice && currentOrdersByPrice.marginBuy[buy])) marginBuyResponse = exchange.createLimitBuyOrder(market, amount * marginMultiplier, buy, {'account_type': 'margin'}).then(recordBuyOrder(market, amount, buy * marginMultiplier, true)).catch(handleFCoinOrderBuyError);
    if (!(currentOrdersByPrice && currentOrdersByPrice.sell[sell])) sellResponse = exchange.createLimitSellOrder(market, amount, sell).then(recordSellOrder(market, amount, sell)).catch(handleFCoinOrderSellError);
    if (!noMargin && !(currentOrdersByPrice && currentOrdersByPrice.marginSell[sell])) marginSellResponse = exchange.createLimitSellOrder(market, amount * marginMultiplier, sell, {'account_type': 'margin'}).then(recordSellOrder(market, amount, sell * marginMultiplier, true)).catch(handleFCoinOrderSellError);

    if (prevBuyResponse) await prevBuyResponse;
    if (prevMarginBuyResponse) await prevMarginBuyResponse;
    if (prevSellReponse) await prevSellReponse;
    if (prevMarginSellResponse) await prevMarginSellResponse;

    prevBuyResponse = buyResponse;
    prevMarginBuyResponse = marginBuyResponse;
    prevSellReponse = sellResponse;
    prevMarginSellResponse = marginSellResponse;

    // console.log({buy, sell});

    if (buyResponse) r.push(buyResponse);
    if (marginBuyResponse) r.push(marginBuyResponse);
    if (sellResponse) r.push(sellResponse);
    if (marginSellResponse) r.push(marginSellResponse);
  }

  for (var i = 1; i < pricePoints; i++) {
    ticker = lastPrices[market];
    console.log(market, ticker);

    var buy = ticker.bid - (0.01 * i * ticker.bid);
    var sell = ticker.ask + (0.01 * i * ticker.ask);

    if (!(currentOrdersByPrice && currentOrdersByPrice.buy[buy])) buyResponse = exchange.createLimitBuyOrder(market, amount, buy).then(recordBuyOrder(market, amount, buy)).catch(handleFCoinOrderBuyError);
    if (!noMargin && !(currentOrdersByPrice && currentOrdersByPrice.marginBuy[buy])) marginBuyResponse = exchange.createLimitBuyOrder(market, amount * marginMultiplier, buy, {'account_type': 'margin'}).then(recordBuyOrder(market, amount * marginMultiplier, buy, true)).catch(handleFCoinOrderBuyError);
    if (!(currentOrdersByPrice && currentOrdersByPrice.sell[sell])) sellResponse = exchange.createLimitSellOrder(market, amount, sell).then(recordSellOrder(market, amount, sell)).catch(handleFCoinOrderSellError);
    if (!noMargin && !(currentOrdersByPrice && currentOrdersByPrice.marginSell[sell])) marginSellResponse = exchange.createLimitSellOrder(market, amount * marginMultiplier, sell, {'account_type': 'margin'}).then(recordSellOrder(market, amount * marginMultiplier, sell, true)).catch(handleFCoinOrderSellError);

    if (prevBuyResponse) await prevBuyResponse;
    if (prevMarginBuyResponse) await prevMarginBuyResponse;
    if (prevSellReponse) await prevSellReponse;
    if (prevMarginSellResponse) await prevMarginSellResponse;

    prevBuyResponse = buyResponse;
    prevMarginBuyResponse = marginBuyResponse;
    prevSellReponse = sellResponse;
    prevMarginSellResponse = marginSellResponse;

    // console.log({buy, sell});

    if (buyResponse) r.push(buyResponse);
    if (marginBuyResponse) r.push(marginBuyResponse);
    if (sellResponse)  r.push(sellResponse);
    if (marginSellResponse) r.push(marginSellResponse);
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
  console.log('cancelling', orders.length); 
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

async function startManage (exchange, pair, count, priceStep, amount) {
  const ticker = lastPrices[pair];
  if (!ticker) return;

  await cancelAllOrders(exchange, _.filter(await exchange.fetchOpenOrders(pair), order => {
    return true;
    if (order.side === 'buy' && ticker) {
      if (Math.abs(order.price - ticker.bid) > (priceStep * count)) return true;
    }
    else if (order.side === 'sell' && ticker) {
      if (Math.abs(order.price - ticker.ask) > (priceStep * count)) return true;
    }
    return false;
  }));
  await cancelAllOrders(exchange, await exchange.fetchOrders(pair, undefined, undefined, {'account_type': 'margin', 'states': 'submitted,partial_filled'}));
  await manageMarketPercent(pair, exchange, count, priceStep, amount);
}

function setIntervalAndRun (fn, interval) { return setInterval(fn, interval), fn();  }

async function manage () {

  var openOrders;

  setIntervalAndRun(async function() {
    const results = [];
    for (var pair of ['BTC/USDT', 'ETH/USDT', 'EOS/USDT', 'LTC/USDT', 'BCH/USDT', 'BCH/BTC']) {
      const result = await checkClosedOrders(fcoin, pair);
      console.log(pair, result);
      if (pair !== 'BCH/BTC') {
        const marginResult = await checkClosedOrders(fcoin, pair, true);
        console.log('margin', pair, marginResult);
        results.push(marginResult);
      }
      results.push(result);
    }
	  console.log('results', results);
    var fees = {amount: {}, estimatedDailyRate: {}, maxDuration: 0};
    results.forEach(result => {
      for (var symbol in result.fees.estimatedDailyRate) {
        fees.amount[symbol] = (fees.amount[symbol] || 0) + result.fees[symbol];
	fees.estimatedDailyRate[symbol] = (fees.estimatedDailyRate[symbol] || 0) + result.fees.estimatedDailyRate[symbol];
      }
      if (result.fees.duration > fees.maxDuration) fees.maxDuration = result.fees.duration;
      if (outstandingOrders[result.id]) {
        console.log('bought/sold', result);
        delete outstandingOrders[result.id];
      }
    });

    console.log(fees);
  }, 20 * 1000);

  const pauseTime = 200;

  await wait (1000);

  while (!stop) {
    try {
      await start ();
      await wait (pauseTime);
      await end ();
    }
    catch (e) {
      console.log('error manage main loop', e);
    }
  }

  async function start () {
    await startManage(fcoin, 'BTC/USDT', 5, 0.1, 0.02);
    await wait (pauseTime);

    await startManage(fcoin, 'ETH/USDT', 5, 0.01, 0.5);
    await wait (pauseTime);

    await startManage(fcoin, 'EOS/USDT', 4, 0.001, 15);
    await wait (pauseTime);

    await startManage(fcoin, 'LTC/USDT', 4, 0.01, 1);
    await wait (pauseTime);

    await startManage(fcoin, 'BCH/USDT', 5, 0.1, 0.25);
    await wait (pauseTime);

    await startManage(fcoin, 'BCH/BTC', 4, 0.00001, 0.2);
  }

  async function end () {
    await manageMarketPercent('BTC/USDT', fcoin, 5, 0.1, 0.02);
    await wait (pauseTime);

    await manageMarketPercent('ETH/USDT', fcoin, 5, 0.01, 0.5);
    await wait (pauseTime);

    await manageMarketPercent('EOS/USDT', fcoin, 4, 0.001, 15);
    await wait (pauseTime);

    await manageMarketPercent('LTC/USDT', fcoin, 4, 0.01, 1);
    await wait (pauseTime);

    await manageMarketPercent('BCH/USDT', fcoin, 5, 0.1, 0.25);
    await wait (pauseTime);

    await manageMarketPercent('BCH/BTC', fcoin, 4, 0.00001, 0.2);
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
