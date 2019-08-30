var fs = require('fs');

var ws = require('ws');
var http = require('http');
var url = require('url');

var http_port = process.env.http_port || 8181;
var ws_port = process.env.ws_port || 8182;

var httpServer = http.createServer((request, response) => {
  fs.readFile('indexws4.html', (error, content) => {
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
  
  for (let market in lastPrices) { 
    if (socket.readyState === ws.OPEN) {
      const ask = lastPrices[market].ask,
            bid = lastPrices[market].bid;

      socket.send(JSON.stringify([`ticker.${market}`, ask, bid]));
    }
  }

  socket.on('message', async (message) => {
    console.log('message', message);
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

function sendTickerData(data) {
  wsServer.clients.forEach(client => {
    if (client.readyState === ws.OPEN) {
      client.send(data);
    }
  });
}


const amounts = {
  'btcusdt': {ask: 0.015, bid: 0.015},
  'bchusdt': {ask: 0.2, bid: 0.2}
};

const tickerToMarket = {
  'btcusdt': 'BTC/USDT',
  'bchusdt': 'BCH/USDT'
};

function sendMessageToWSockets (message) {
  return sendTickerData(message);
}

function makeNewBestAsk (ticker, ask) {
  return limitSell(fcoin, tickerToMarket[ticker], amounts[ticker].ask, ask)
           .then(data => {
             sendMessageToWSockets(JSON.stringify(['sell', ticker, ask, amounts[ticker].ask, data.id]))
           });
}

function makeNewBestBid (ticker, bid) {
  return limitBuy(fcoin, tickerToMarket[ticker], amounts[ticker].bid, bid)
            .then(data => {
              sendMessageToWSockets(JSON.stringify(['buy', ticker, bid, amounts[ticker].bid, data.id]))
            });
}

watchTickers(['btcusdt', 'bchusdt']);
setInterval(checkClosedOrders, 3 * 1000);

function checkClosedOrders () {
  for (let ticker of ['btcusdt', 'bchusdt']) {
    fcoin.fetchOrders(tickerToMarket[ticker], undefined, undefined, {states: 'filled,partial_filled,partial_canceled', 'account_type': 'margin'})
         .then(result => {
           const ids = result.map(r => r.id);
//           console.log('ticker', ticker, ids);
           sendMessageToWSockets(JSON.stringify(['closed', ticker, ids]));
         });
  }
}

function watchTickers (markets) {
  var tickers = _.map(markets, m => `ticker.${m}`);

  var fcoinWs = makeNewWs();

  function makeNewWs() {

    var nws = new ws('wss://api.fcoin.com/v2/ws');

    nws.on('close', () => {
      console.log('ticker ws closed');
      
      fcoinWs = makeNewWs(); // ??
    });

    nws.on('open', () => {
      console.log('fcoin ws open');

      const intervalId = setInterval(() => {
        if (nws.readyState === ws.OPEN) {
          console.log('ping');
          nws.send(JSON.stringify({'cmd': 'ping', 'args': [new Date().getTime()]}));
        }
        else {
          clearInterval(intervalId);
        }
      }, 30 * 1000);

      nws.send(
        JSON.stringify({
          'cmd': 'sub',
          'args': tickers
        })
      );
    });

    nws.on('message', message => {
      var data = JSON.parse(message);

      switch (data.type) {
        case 'ticker.btcusdt':
          var ask = data.ticker[4];
          var bid = data.ticker[2];

          var market = 'btcusdt';

          lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};
          orders[market] = orders[market] || {};

          var lastAsk = lastPrices[market].ask;
          var lastBid = lastPrices[market].bid;

          if (lastAsk === ask && lastBid === bid) break;

          if (ask !== lastAsk) makeNewBestAsk(market, ask);
          if (bid !== lastBid) makeNewBestBid(market, bid);

          lastPrices[market].ask = ask;
          lastPrices[market].bid = bid;

          console.log('btc/usdt', ask, bid);

          sendTickerData(JSON.stringify([data.type, ask, bid])); 
//        makeOrders (market, fcoin, 3, 0.1, 0.001, ask + 0.1, bid - 0.1);

          break;

        case 'ticker.bchusdt':
          var ask = data.ticker[4];
          var bid = data.ticker[2];

          var market = 'bchusdt';

          lastPrices[market] = lastPrices[market] || {ask: 0, bid: 0};
          orders[market] = orders[market] || {};

          var lastAsk = lastPrices[market].ask;
          var lastBid = lastPrices[market].bid;

          if (lastAsk === ask && lastBid === bid) break;

          if (ask !== lastAsk) makeNewBestAsk(market, ask);
          if (bid !== lastBid) makeNewBestBid(market, bid);

          lastPrices[market].ask = ask;
          lastPrices[market].bid = bid;

          console.log('bch/usdt', ask, bid);

          sendTickerData(JSON.stringify([data.type, ask, bid]));

//        makeOrders (market, fcoin, 3, 0.01, 0.02, ask, bid);

          break;
        default:
          console.log('unknown', message);
      }
    });
  }
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
    .createLimitBuyOrder(market, amount, price, {'account_type': 'margin'})
    .catch(e => {
      console.log('limit buy error', market, amount, price, e.message);
      var d = JSON.parse(e.message.substr(e.message.indexOf(' ') + 1));
      if (d.msg === 'system busy') return limitBuy(exchange, market, amount, price);
    });
}

function limitSell (exchange, market, amount, price) {
  console.log('sell', market, amount, price);

  return exchange
    .createLimitSellOrder(market, amount, price, {'account_type': 'margin'})
    .catch(e => {
      console.log('limit sell error', market, amount, price, e.message);
      var d = JSON.parse(e.message.substr(e.message.indexOf(' ') + 1));
      if (d.msg === 'system busy') return limitSell(exchange, market, amount, price);
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
