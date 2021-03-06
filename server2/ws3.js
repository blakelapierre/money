var fs = require('fs');

var ws = require('ws');
var http = require('http');
var url = require('url');

var http_port = process.env.http_port || 8181;
var ws_port = process.env.ws_port || 8182;

var httpServer = http.createServer((request, response) => {
  fs.readFile('index.html', (error, content) => {
    if (error) {
      response.writeHead(500);
      response.end('error' + JSON.stringify(error));
      response.end();
    }
    else {
      response.writeHead(200, {'Content-Type': 'text/html'});
      response.end(content, 'utf-8');
    }
  });
});

var wsServer = new ws.Server({noServer: true});

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
console.log(pathname);
  if (pathname === '/ws') {
    wsServer.handleUpgrade(request, socket, head, ws => {
      wsServer.emit('connection', ws, request);
    });
  }
  else {
    socket.destroy();
  }
});

wsServer.on('connection', socket => {
  console.log('ws');
  socket.on('message', async (message) => {
    console.log('message', message);
    socket.emit(message);
    if (message.indexOf('command ') === 0) {
      var data = JSON.parse(message.substr('command '.length));

      console.log('data', JSON.stringify(data));

      if (data.command.indexOf('balances') === 0) {
        console.log('fetching balance');
        try {
          var balances = await fcoin.fetchBalance();
          socket.send(`balances ${JSON.stringify(balances)}`);
          //     .catch(error => socket.emit(`error balances {JSON.stringify(error)}`));
        }
        catch (e) {
          socket.send(`error balances ${JSON.stringify(e)}`);
        }
      }
      else if (data.command.indexOf('markets') === 0) {
        console.log('loading markets');
        await fcoin.load_markets();
//        console.log(fcoin.markets);

        socket.send(`markets ${JSON.stringify(Object.keys(fcoin.markets))}`);
      }
    }
  });
});

httpServer.listen(http_port);
console.log('http listening on', http_port);
//wsServer.listen(ws_port);
//console.log('ws listening on', ws_port);

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


async function cancelAllOrders(exchange, symbols) {
  console.log('Fetching open', symbols, 'orders on', exchange.id);

  var openOrders, symbol;

  for (var i = 0; i < symbols.length; i++) {
    try {
      symbol = symbols[i];

      openOrders = await exchange.fetchOpenOrders(symbol);

      if (openOrders.length > 0) {
        console.log('Canceling', openOrders.length, symbol, 'orders on', exchange.id);

        await cancelAllOrders2(exchange, openOrders);
      }
    }
    catch (e) {
      console.error('Error canceling', symbol, 'orders', e);
    }
  }
}

/*
(async function (symbols) {
  try {
    await cancelAllOrders(fcoin, symbols);
  }
  catch (e) {
    console.error('error', e);
  }
  // var openOrders, symbol;

  // for (var i = 0; i < symbols.length; i++) {
  //   symbol = symbols[i];

  //   console.log('Fetching open', symbol, 'orders');
  //   openOrders = await(fcoin, fcoin.fetchOpenOrders(symbol));

  //   if (openOrders.length > 0) {
  //     console.log('Canceling', openOrders.length, symbol, 'orders');
  //     await cancelAllOrders2(fcoin, openOrders);
  //   }
  // }

  var pairs = _.map(symbols, symbol => symbol.split('/').join('').toLowerCase());

  watchTickers(pairs);
})(Object.keys(_.pickBy(config['fcoin'], value => value.trade)));
*/


function watchTickers (markets) {
  var tickers = _.map(markets, m => `ticker.${m}`);

  var fcoinWs = new ws('wss://api.fcoin.com/v2/ws');

  fcoinWs.on('open', () => {
    console.log('fcoin ws open');

    setInterval(() => {
      if (fcoinWs.readyState === 4) {
        console.log('ping');
        fcoinWs.send(JSON.stringify({'cmd': 'ping'}));
      }
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

      case 'ticker.ftpax':
        var ask = data.ticker[4];
        var bid = data.ticker[2];

        var market = 'FT/PAX';

        lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};
        orders[market] = orders[market] || {};

        var lastAsk = lastPrices[market].ask;
        var lastBid = lastPrices[market].bid;

        if (lastAsk === ask && lastBid === bid) break;

        lastPrices[market].ask = ask;
        lastPrices[market].bid = bid;

        console.log('FT/PAX', ask, bid);

        makeOrders (market, fcoin, 3, 0.01, 100, ask, bid);

        break;

      default:
        console.log('unknown', message);
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

  // cancelAllOrders(exchange, orders[market]);

  // for (var i = 0; i < pricePoints; i++) {
  //   var step = priceStep * i;

  //   var buy = bid - step;
  //   var sell = ask + step;


  //   console.log(i, {buy, sell});

  //   var buyResponse = limitBuy(fcoin, market, amount, buy).then(data => {
  //     console.log('buy response', data);
  //     orders[market][data.id] = true;
  //   });

  //   // var buyResponse = exchange.createLimitBuyOrder(market, amount, buy)
  //   //                           .then(data => {
  //   //                             orders[market][data.id] = true;
  //   //                           })
  //   //                           .catch(e => console.log('error buying', market, amount, buy, e.message));

  //   console.log('sell', market, amount, sell);
  //   var sellResponse = exchange.createLimitSellOrder(market, amount, sell)
  //                              .then(data => {
  //                                 orders[market][data.id] = true;
  //                               })
  //                              .catch(e => console.log('error selling', market, amount, sell, e.message));
  // }
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

async function cancelAllOrders2(exchange, orders) {
  for (let i = 0; i < orders.length; i += 4) {
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

    if ((i + 3) < orders.length) {
      o = orders[i + 3];
      console.log('cancelling', i + 4, '/', orders.length, o.symbol, o.side, o.price, o.amount, o.id);
      try {
        r.push(exchange.cancelOrder(o.id));
      }
      catch (e) {}
    }

    await Promise.all(r).catch(e => console.error('error cancelling order', e));
  }
}
