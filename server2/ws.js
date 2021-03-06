var fs = require('fs');

var ws = require('ws');

var ccxt = require('ccxt');
var _ = require('lodash');

var {fcoin_api_key, fcoin_secret} = process.env;
var {coinbase_api_key, coinbase_secret, coinbase_passphrase} = process.env;
var {coss_api_key, coss_secret} = process.env;
var {coinbene_api_key, coinbene_secret} = process.env;
var {idcm_api_key, idcm_secret} = process.env;

var  fcoin = new ccxt.fcoin({apiKey: fcoin_api_key, secret: fcoin_secret})
    ,gdax = new ccxt.gdax({apiKey: coinbase_api_key, secret: coinbase_secret, password: coinbase_passphrase})
    ,coss = new ccxt.coss({apiKey: coss_api_key, secret: coss_secret});
    //,coinbene = new ccxt.coinbene({apiKey: coinbene_api_key, secret: coinbene_secret})
    //,idcm = new ccxt.idcm({apiKey: idcm_api_key, secret: idcm_secret});

var apis = {fcoin, gdax/*, coinbene, idcm*/};

(async function() {
  var openOrders = await fcoin.fetchOpenOrders('BTC/USDT');
  await cancelAllOrders2(fcoin, openOrders);

  openOrders = await fcoin.fetchOpenOrders('BCH/USDT');
  await cancelAllOrders2(fcoin, openOrders);

  openOrders = await fcoin.fetchOpenOrders('BCH/BTC');
  await cancelAllOrders2(fcoin, openOrders);

  openOrders = await fcoin.fetchOpenOrders('FT/USDT');
  await cancelAllOrders2(fcoin, openOrders);

  // watchTickers(['btcusdt']);
  watchTickers(['btcusdt', 'bchusdt', 'bchbtc', 'ftusdt']);
})()


function watchTickers (markets) {
  var tickers = _.map(markets, m => `ticker.${m}`);

  var fcoinWs = new ws('wss://api.fcoin.com/v2/ws');


  fcoinWs.on('open', () => {
    console.log('fcoin ws open');

    setInterval(() => {
      if (fcoinWs.readyState === 4) fcoinWs.send(JSON.stringify({'cmd': 'ping'}));
    }, 30 * 1000);

    fcoinWs.send(
      JSON.stringify({
        'cmd': 'sub',
        'args': tickers
      })
    );
  });

  fcoinWs.on('message', message => {
    var data = JSON.parse(message);

    switch (data.type) {
      case 'ticker.btcusdt':
        var ask = data.ticker[4];
        var bid = data.ticker[2];

        var market = 'BTC/USDT';

        lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};
        orders[market] = orders[market] || {};

        var lastAsk = lastPrices[market].ask;
        var lastBid = lastPrices[market].bid;

        if (lastAsk === ask && lastBid === bid) break;

        lastPrices[market].ask = ask;
        lastPrices[market].bid = bid;

        console.log('btc/usdt', ask, bid);

        makeOrders (market, fcoin, 3, 0.1, 0.001, ask + 0.1, bid - 0.1);

        break;

      case 'ticker.bchusdt':
        var ask = data.ticker[4];
        var bid = data.ticker[2];

        var market = 'BCH/USDT';

        lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};
        orders[market] = orders[market] || {};

        var lastAsk = lastPrices[market].ask;
        var lastBid = lastPrices[market].bid;

        if (lastAsk === ask && lastBid === bid) break;

        lastPrices[market].ask = ask;
        lastPrices[market].bid = bid;

        console.log('bch/usdt', ask, bid);

        makeOrders (market, fcoin, 3, 0.01, 0.02, ask, bid);

        break;

      case 'ticker.bchbtc':
        var ask = data.ticker[4];
        var bid = data.ticker[2];

        var market = 'BCH/BTC';

        lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};
        orders[market] = orders[market] || {};

        var lastAsk = lastPrices[market].ask;
        var lastBid = lastPrices[market].bid;

        if (lastAsk === ask && lastBid === bid) break;

        lastPrices[market].ask = ask;
        lastPrices[market].bid = bid;

        console.log('bch/btc', ask, bid);

        makeOrders (market, fcoin, 3, 0.00001, 0.01, ask, bid);

        break;

      case 'ticker.ftusdt':
        var ask = data.ticker[4];
        var bid = data.ticker[2];

        var market = 'FT/USDT';

        lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};
        orders[market] = orders[market] || {};

        var lastAsk = lastPrices[market].ask;
        var lastBid = lastPrices[market].bid;

        if (lastAsk === ask && lastBid === bid) break;

        lastPrices[market].ask = ask;
        lastPrices[market].bid = bid;

        console.log('FT/USDT', ask, bid);

        makeOrders (market, fcoin, 3, 0.0001, 100, ask, bid);

        break;
    }
  });
}

var lastPrices = {};
var orders = {};

function makeOrders (market, exchange, pricePoints, priceStep, amount, ask, bid) {
  // lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};
  // orders[market] = orders[market] || {};

  // var lastAsk = lastPrices[market].ask;
  // var lastBid = lastPrices[market].bid;

  // if (lastAsk === ask && lastBid === bid) return;

  // lastPrices[market].ask = ask;
  // lastPrices[market].bid = bid;

  console.log({lastPrices});

  cancelAllOrders(exchange, orders[market]);

  for (var i = 0; i < pricePoints; i++) {
    var step = priceStep * i;

    var buy = bid - step;
    var sell = ask + step;


    console.log(i, {buy, sell});

    var buyResponse = limitBuy(fcoin, market, amount, buy).then(data => {
      console.log('buy response', data);
      orders[market][data.id] = true;
    });

    // var buyResponse = exchange.createLimitBuyOrder(market, amount, buy)
    //                           .then(data => {
    //                             orders[market][data.id] = true;
    //                           })
    //                           .catch(e => console.log('error buying', market, amount, buy, e.message));

    console.log('sell', market, amount, sell);
    var sellResponse = exchange.createLimitSellOrder(market, amount, sell)
                               .then(data => {
                                  orders[market][data.id] = true;
                                })
                               .catch(e => console.log('error selling', market, amount, sell, e.message));
  }
}

function limitBuy (exchange, market, amount, price) {
  console.log('buy', market, amount, price);

  return exchange
    .createLimitBuyOrder(market, amount, price)
    .catch(e => {
      var d = JSON.parse(e.message.substr(e.message.indexOf(' ') + 1));
      if (d.msg === 'system busy') return limitBuy(exchange, market, amount, price);
    });
}

async function cancelAllOrders(exchange, ids) {
  var orders = Object.keys(ids);

  for (let i = 0; i < orders.length; i += 3) {
    var o = orders[i];
    var r = [];
    // console.log('cancelling', i + 1, '/', orders.length, o);
    try {
      delete ids[o];
      r.push(exchange.cancelOrder(o));
    }
    catch (e) {}

    if ((i + 1) < orders.length) {
      o = orders[i + 1];
      // console.log('cancelling', i + 2, '/', orders.length, o);
      try {
        delete ids[o];
        r.push(exchange.cancelOrder(o));
      }
      catch (e) {}
    }

    if ((i + 2) < orders.length) {
      o = orders[i + 2];
      // console.log('cancelling', i + 3, '/', orders.length, o);
      try {
        delete ids[o];
        r.push(exchange.cancelOrder(o));
      }
      catch (e) {}
    }

    await Promise.all(r).catch(e => console.error('error cancelling order', e.message));
  }
}


async function cancelAllOrders2(exchange, orders) {
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