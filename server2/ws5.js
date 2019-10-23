var fs = require('fs');

var ws = require('ws');
var http = require('http');
var url = require('url');

var http_port = process.env.http_port || 8183;
var ws_port = process.env.ws_port || 8184;

var httpServer = http.createServer((request, response) => {
  if (request.url === '/smoothie.js') {
    fs.readFile('smoothie.js', (error, content) => {
      if (error) {
        response.writeHead(500);
        response.end('error' + JSON.stringify(error));
        response.end();
      }
      else {
        response.writeHead(200, {'Content-Type': 'application/javascript'});
        response.end(content, 'utf-8');
      }
    });
    return;
  }

  fs.readFile('indexws5.html', (error, content) => {
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

const balances = {};
wsServer.on('connection', socket => {
  console.log('ws');
  
  for (let market in lastPrices) { 
    if (socket.readyState === ws.OPEN) {
      const ask = lastPrices[market].ask,
            bid = lastPrices[market].bid;

      socket.send(JSON.stringify([`ticker.${market}`, ask, bid]));
    }
  }

  socket.send(JSON.stringify(['orders', orders]));

  if (balances.latest)  socket.send(JSON.stringify(['balances', balances.latest]));

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

/*async function cancelAllOrders(exchange, symbols) {
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
}*/

function sendTickerData(data) {
  wsServer.clients.forEach(client => {
    if (client.readyState === ws.OPEN) {
      client.send(data);
    }
  });
}


const amounts = {
  'btcusdt': {ask: 0.01, bid: 0.01},
  //'btcusdt': {ask: 0.1, bid: 0.1},
  'bchusdt': {ask: 0.05, bid: 0.05},
  'ethusdt': {ask: 0.1, bid: 0.1},
  'ltcusdt': {ask: 0.1, bid: 0.1}
};

const tickerToMarket = {
  'btcusdt': 'BTC/USDT',
  'bchusdt': 'BCH/USDT',
  'ethusdt': 'ETH/USDT',
  'ltcusdt': 'LTC/USDT'
};

const orders = {
  'btcusdt': {asks: [], bids: [], map: {}},
  'bchusdt': {asks: [], bids: [], map: {}},
  'ethusdt': {asks: [], bids: [], map: {}},
  'ltcusdt': {asks: [], bids: [], map: {}}
};

const missedOrders = {
  'btcusdt': {asks: {}, bids: {}},
  'bchusdt': {asks: {}, bids: {}},
  'ethusdt': {asks: {}, bids: {}},
  'ltcusdt': {asks: {}, bids: {}}
};

const multipliers = {
  'btcusdt': {ask: 1, bid: 1},
  'bchusdt': {ask: 1, bid: 1},
  'ethusdt': {ask: 1, bid: 1},
  'ltcusdt': {ask: 1, bid: 1}
};

const hasFirstPrice = {};

function sendMessageToWSockets (message) {
  return sendTickerData(message);
}

function cancelOldestOrder (side, ticker) {
  var os = orders[ticker][side];

  if (os.length > 0) {
    var o = os[0];

    return fcoin.cancelOrder(o)
         .then(result => {
           for (let i = 0; i < os.length; i++) {
             if (o === os[i]) {
               const s = side.substring(0,3);
               const price = orders[ticker].map[o][s];
               if (missedOrders[ticker][side === 'asks' ? 'bids' : 'asks'][price.toFixed(2)] > 1) {
                 missedOrders[ticker][side === 'asks' ? 'bids' : 'asks'][price.toFixed(2)]--;
                 sendMessageToWSockets(JSON.stringify(['missedOrders', side === 'asks' ? 'bids' : 'asks', missedOrders[ticker][side === 'asks' ? 'bids' : 'asks']]));
                 if (missedOrders[ticker][side === 'asks' ? 'bids' : 'asks'][price.toFixed(2)] === 0) {
                   delete missedOrders[ticker][side === 'asks' ? 'bids' : 'asks'][price.toFixed(2)];
                 }
               }
               else {
                 missedOrders[ticker][side][price.toFixed(2)] = (missedOrders[ticker][side][price.toFixed(2)] || 0) + 1;
                 sendMessageToWSockets(JSON.stringify(['missedOrders', ticker, side, missedOrders[ticker][side]]));
               }
               os.splice(i, 1);
               delete orders[ticker].map[o];
               break;
             }
           }

           console.log('cancel', ticker, side);
           sendMessageToWSockets(JSON.stringify(['cancel', o, ticker]));
         })
         .catch(error => {
           try {
             var d = JSON.parse(error.message.substr(error.message.indexOf(' ') + 1));
             if (d && d.status === 3008) {
               console.log('order not active');
               for (let i = 0; i < os.length; i++) {
                 if (o === os[i]) {
                   os.splice(i, 1);
                   delete orders[ticker].map[o];
                   sendMessageToWSockets(JSON.stringify(['closed', ticker, [o]]));
                   break;
                 }
               }
             }
             else console.log('cancel error', error);
           }
           catch (e) {
             console.log('cancel error unparseable', error);
           }
         });
  }
  else return new Promise(resolve => resolve());
}

function makeNewBestAsk (ticker, ask) {
  let amount = amounts[ticker].ask;

  const usdtAmount = amounts[ticker].usdt;

  if (usdtAmount) {
    amount = usdtAmount.ask / ask;
  }


  return limitSell(fcoin, tickerToMarket[ticker], amount, ask)
           .then(data => {
             if (data && data.id) {
               orders[ticker].asks.push(data.id);
               orders[ticker].map[data.id] = {id: data.id, ticker, amount, ask};
               sendMessageToWSockets(JSON.stringify(['sell', ticker, ask, amount, data.id]));

               if (orders[ticker].asks.length > 2) cancelOldestOrder('asks', ticker);
/*               if (orders[ticker].asks.length > 11) {
                 console.log(ticker, 'asks length', orders[ticker].asks.length);
                 cancelOldestOrder('asks', ticker);
               }*/
             }
           });
}

function makeNewBestBid (ticker, bid) {
  let amount = amounts[ticker].bid;
  
  const usdtAmount = amounts[ticker].usdt;

  if (usdtAmount) {
    amount = usdtAmount.bid / bid;
  }

  console.log({amount, bid, usdtAmount});

  return limitBuy(fcoin, tickerToMarket[ticker], amount, bid)
            .then(data => {
              if (data && data.id) {
                orders[ticker].bids.push(data.id);
                orders[ticker].map[data.id] = {id: data.id, ticker, amount, bid};
                sendMessageToWSockets(JSON.stringify(['buy', ticker, bid, amounts[ticker].bid, data.id]));

                if (orders[ticker].bids.length > 2) cancelOldestOrder('bids', ticker);

/*               if (orders[ticker].bids.length > 11) {
                 console.log(ticker, 'bids length', orders[ticker].bids.length);
                 cancelOldestOrder('bids', ticker);
                }*/
              }
            });
}

const tickers = ['btcusdt'/*, 'bchusdt', 'ethusdt', 'ltcusdt'*/];

watchTickers(tickers);
setInterval(checkClosedOrders, 3 * 1000);
runEvery(checkMarginBalances, 15 * 1000);

function runEvery(fn, time) { fn(); return setInterval(fn, time); }

function cancelAllOrders (ticker) {
  return fcoin.fetchOpenOrders(tickerToMarket[ticker], undefined, undefined, {'account_type': 'margin'})
    .then(results => cancelAllOrders2(fcoin, results));
}

function checkMarginBalances () {
//  fcoin.fetchBalance({'account_type': 'margin'})
  fcoin.privateGetBrokerLeveragedAccounts()
//  fcoin.api.private.get['broker/leveraged_accounts']()
    .then(result => {
//      console.log('balances', result);
      balances.latest = result;
      sendMessageToWSockets(JSON.stringify(['balances', result]));
    });
}

function checkClosedOrders () {
  for (let ticker of tickers) {
    fcoin.fetchOrders(tickerToMarket[ticker], undefined, undefined, {states: 'filled', 'account_type': 'margin'})
         .then(result => {
           const ids = result.map(r => r.id);
         
           ids.forEach(id => {
             for (let i = orders[ticker].asks.length - 1; i >= 0; i--) {
               if (id === orders[ticker].asks[i]) {
                 orders[ticker].asks.splice(i, 1);
                 delete orders[ticker].map[id];
                 const ask = lastPrices[ticker].ask;
                 makeNewBestAsk(ticker, ask);
                 var prices = Object.keys(missedOrders[ticker]['asks']);
                 var min = Infinity;
                 for (let i = 0; i < prices.length; i++) {
                   var price = parseFloat(prices[i]);
                   if (price < min) min = price;
                 }

                 if (min < ask) {
                   console.log('make up ask for', min.toFixed(2), 'at', ask.toFixed(2));
                   makeNewBestAsk(ticker, ask);
                   missedOrders[ticker]['asks'][min.toFixed(2)]--;
                   if (missedOrders[ticker]['asks'][min.toFixed(2)] === 0) {
                     delete missedOrders[ticker]['asks'][min.toFixed(2)];
                   }
                 }
                 else {
                   if (missedOrders[ticker]['asks'][ask.toFixed(2)] > 0) {
                     console.log('make up ask at', ask.toFixed(2));
//                     console.log(missedOrders[ticker]['asks']);
                     makeNewBestAsk(ticker, ask);
                     missedOrders[ticker]['asks'][ask.toFixed(2)]--;
                     if (missedOrders[ticker]['asks'][ask.toFixed(2)] === 0) {
                       delete missedOrders[ticker]['asks'][ask.toFixed(2)];
                     }
                   }
                 }
                 sendMessageToWSockets(JSON.stringify(['missedOrders', ticker, 'asks', missedOrders[ticker]['asks']]));
//                 console.log('found in ask');
               }
             }
             for (let i = orders[ticker].bids.length - 1; i >= 0; i--) {
               if (id === orders[ticker].bids[i]) {
                 orders[ticker].bids.splice(i, 1);
                 delete orders[ticker].map[id];
                 const bid = lastPrices[ticker].bid;
                 makeNewBestBid(ticker, bid);
                 var prices = Object.keys(missedOrders[ticker]['bids']);
                 var max = -Infinity;
                 for (let i = 0; i < prices.length; i++) {
                   var price = parseFloat(prices[i]);
                   if (price > max) max = price;
                 }

                 if (max > bid) {
                   console.log('make up bid for', max.toFixed(2), 'at', bid.toFixed(2));
                   makeNewBestBid(ticker, bid);
                   missedOrders[ticker]['bids'][max.toFixed(2)]--;
                   if (missedOrders[ticker]['bids'][max.toFixed(2)] === 0) {
                     delete missedOrders[ticker]['bids'][max.toFixed(2)];
                   }
                 }
                 else if (missedOrders[ticker]['bids'][bid.toFixed(2)] > 0) {
                   console.log('make up bid at', bid.toFixed(2));
//                   console.log(missedOrders[ticker]['bids']);
                   makeNewBestBid(ticker, bid);
                   missedOrders[ticker]['bids'][bid.toFixed(2)]--;
                   if (missedOrders[ticker]['bids'][bid.toFixed(2)] === 0) {
                     delete missedOrders[ticker]['bids'][bid.toFixed(2)];
                   }
                 }
                 sendMessageToWSockets(JSON.stringify(['missedOrders', ticker, 'bids', missedOrders[ticker]['bids']]));
//                 console.log('found in bids');
               }
             }
           });
           sendMessageToWSockets(JSON.stringify(['closed', ticker, ids]));
         });
  }
}

function startPairGeneration(ticker) {
  runEvery(() => {
    var ask, bid;
    if (ticker === 'btcusdt') {
      ask = lastPrices[ticker].bid + 0.1;
      bid = lastPrices[ticker].ask - 0.1;
//      bid = lastPrices[ticker].ask - 0.2;
//      bid = ask - 0.3;
//      ask = bid + 0.3;
      makeNewBestAsk(ticker, ask);
      makeNewBestBid(ticker, bid);
//      wait(1000).then(() => makeNewBestAsk(ticker, lastPrices[ticker].bid + 2));
//      wait(1000).then(() => makeNewBestBid(ticker, lastPrices[ticker].ask - 2));
//      wait(500).then(() => makeNewBestAsk(ticker, ask + 1));
//      wait(500).then(() => makeNewBestBid(ticker, bid - 1));
    }
    else {
      ask = lastPrices[ticker].ask;
      bid = lastPrices[ticker].bid;
      makeNewBestAsk(ticker, lastPrices[ticker].ask);
      makeNewBestBid(ticker, lastPrices[ticker].bid);
    }


      var prices = Object.keys(missedOrders[ticker]['asks']);
      var min = 9999999999;
      for (let i = 0; i < prices.length; i++) {
        var price = parseFloat(prices[i]);
        if (price < min) min = price;
      }
console.log({min, ask});
      if (min < bid) {
        console.log('make up ask for', min.toFixed(2), 'at', bid.toFixed(2));
        makeNewBestAsk(ticker, bid);
        missedOrders[ticker]['asks'][min.toFixed(2)]--;
        if (missedOrders[ticker]['asks'][min.toFixed(2)] === 0) {
          delete missedOrders[ticker]['asks'][min.toFixed(2)];
        }
      }
      else {
        if (missedOrders[ticker]['asks'][ask.toFixed(2)] > 0) {
          console.log('make up ask at', ask.toFixed(2));
//          console.log(missedOrders[ticker]['asks']);
          makeNewBestAsk(ticker, ask);
          missedOrders[ticker]['asks'][ask.toFixed(2)]--;
          if (missedOrders[ticker]['asks'][ask.toFixed(2)] === 0) {
            delete missedOrders[ticker]['asks'][ask.toFixed(2)];
          }
        }
      }
      sendMessageToWSockets(JSON.stringify(['missedOrders', ticker, 'asks', missedOrders[ticker]['asks']]));

      var prices = Object.keys(missedOrders[ticker]['bids']);
      var max = -Infinity;
      for (let i = 0; i < prices.length; i++) {
        var price = parseFloat(prices[i]);
        if (price > max) max = price;
      }
console.log({max, bid});
      if (max > ask) {
        console.log('make up bid for', max.toFixed(2), 'at', ask.toFixed(2));
        makeNewBestBid(ticker, ask);
        missedOrders[ticker]['bids'][max.toFixed(2)]--;
        if (missedOrders[ticker]['bids'][max.toFixed(2)] === 0) {
          delete missedOrders[ticker]['bids'][max.toFixed(2)];
        }
      }
      else {
        if (missedOrders[ticker]['bids'][bid.toFixed(2)] > 0) {
          console.log('make up bid at', bid.toFixed(2));
//          console.log(missedOrders[ticker]['bids']);
          makeNewBestBid(ticker, bid);
          missedOrders[ticker]['bids'][bid.toFixed(2)]--;
          if (missedOrders[ticker]['bids'][bid.toFixed(2)] === 0) {
            delete missedOrders[ticker]['bids'][bid.toFixed(2)];
          }
        }
      }
      sendMessageToWSockets(JSON.stringify(['missedOrders', ticker, 'bids', missedOrders[ticker]['bids']]));
  }, 5 * 1000);
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

      if (data.type.indexOf('ticker.') === 0) {
        var ask = data.ticker[4];
        var bid = data.ticker[2];
        var vol = data.ticker[10];

        var ticker = data.type.split('.')[1];

        lastPrices[ticker] = lastPrices[ticker] || {ask: 0, bid: 0};
        orders[ticker] = orders[ticker] || {};

        var lastAsk = lastPrices[ticker].ask;
        var lastBid = lastPrices[ticker].bid;

        if (!hasFirstPrice[ticker]) startPairGeneration(ticker);
//        if (!hasFirstPrice[ticker]) manageSortMining(ticker);
        hasFirstPrice[ticker] = true;
        //if (lastAsk === ask && lastBid === bid) break;
        if (lastAsk !== ask || lastBid !== bid) {
          var m = multipliers[ticker];
/*
          if (ask !== lastAsk) {
            makeNewBestAsk(ticker, ask);
          }
          if (bid !== lastBid) {
            makeNewBestBid(ticker, bid);
          }
*/
//          makeNewBestAsk(ticker, bid + 0.1);
//          makeNewBestBid(ticker, ask + 0.1);

          if (missedOrders[ticker]['asks'][ask.toFixed(2)] > 0) {
            console.log('make up ask at', ask.toFixed(2));
//            console.log(missedOrders[ticker]['asks']);
            makeNewBestAsk(ticker, ask);
            missedOrders[ticker]['asks'][ask.toFixed(2)]--;
            if (missedOrders[ticker]['asks'][ask.toFixed(2)] === 0) {
              delete missedOrders[ticker]['asks'][ask.toFixed(2)];
            }
          }
          if (missedOrders[ticker]['bids'][bid.toFixed(2)] > 0) {
            console.log('make up bid at', bid.toFixed(2));
//            console.log(missedOrders[ticker]['bids']);
            makeNewBestBid(ticker, bid);
            missedOrders[ticker]['bids'][bid.toFixed(2)]--;
            if (missedOrders[ticker]['bids'][bid.toFixed(2)] === 0) {
              delete missedOrders[ticker]['bids'][bid.toFixed(2)];
            }
          }

          lastPrices[ticker].ask = ask;
          lastPrices[ticker].bid = bid;

          console.log(ticker, ask, bid);

          sendTickerData(JSON.stringify([data.type, ask, bid, vol]));
        }
      }
    });
  }
}

var lastPrices = {};
const hasAsks = {}, hasBids = {};
//var orders = {};

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

function wait (ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function limitBuy (exchange, market, amount, price) {
  console.log('buy', market, amount, price);

  return exchange
    .createLimitBuyOrder(market, amount, price, {'account_type': 'margin'})
    .catch(e => {
      console.log('limit buy error', market, amount, price, e.message);
      var ticker = market.split('/').join('').toLowerCase();
      var d = JSON.parse(e.message.substr(e.message.indexOf(' ') + 1));
      if (d.msg === 'system busy') return wait(200).then(() => makeNewBestBid(ticker, lastPrices[ticker].bid));
      else if (d.msg === 'account balance insufficient') {
        cancelOldestOrder('bids', ticker);//.then(() => limitBuy(exchange, market, amount, lastPrices[ticker].bid));
        sendMessageToWSockets(JSON.stringify(['balance low', ticker]));
      }
      missedOrders[ticker]['bids'][price.toFixed(2)] = (missedOrders[ticker]['bids'][price.toFixed(2)] || 0) + 1;
    });
}

function limitSell (exchange, market, amount, price) {
  console.log('sell', market, amount, price);

  return exchange
    .createLimitSellOrder(market, amount, price, {'account_type': 'margin'})
    .catch(e => {
      console.log('limit sell error', market, amount, price, e.message);
      var ticker = market.split('/').join('').toLowerCase();

      var d = JSON.parse(e.message.substr(e.message.indexOf(' ') + 1));
      if (d.msg === 'system busy') return wait(200).then(() => makeNewBestAsk(ticker, lastPrices[ticker].ask));
      else if (d.msg === 'account balance insufficient') {
        cancelOldestOrder('asks', ticker);//.then(() => limitSell (exchange, market, amount, lastPrices[ticker].ask));
        sendMessageToWSockets(JSON.stringify(['balance low', ticker]));
      }
      missedOrders[ticker]['asks'][price.toFixed(2)] = (missedOrders[ticker]['asks'][price.toFixed(2)] || 0) + 1;
    });
}

async function cancelAllOrders2(exchange, ordersToCancel) {
  var os, ticker;
  for (let i = 0; i < ordersToCancel.length; i += 4) {
    var o = ordersToCancel[i];
    var r = [];
    console.log('cancelling', i + 1, '/', ordersToCancel.length, o.symbol, o.side, o.price, o.amount, o.id);
    ticker = o.symbol.split('/').join('').toLowerCase();
    os = orders[ticker][o.side === 'sell' ? 'asks' : 'bids'];
    try {
      var id = o.id;
      r.push(exchange.cancelOrder(id)
         .then(result => {
           for (let i = 0; i < os.length; i++) {
             if (id === os[i]) {
               os.splice(i, 1);
               delete orders[ticker].map[id];
               break;
             }
           }

           console.log('cancel', ticker, o.side);
           sendMessageToWSockets(JSON.stringify(['cancel', id, ticker]));
         })
         .catch(error => {
           console.log('cancel error', error);
           var d = JSON.parse(error.message.substr(error.message.indexOf(' ') + 1));
           if (d && d.status === 3008) {
             console.log('order not active');
             for (let i = 0; i < os.length; i++) {
               if (o.id === os[i]) {
                 os.splice(i, 1);
                 delete orders[ticker].map[o.id];
                 sendMessageToWSockets(JSON.stringify(['closed', ticker, [o.id]]));
                 break;
               }
             }
           }
           else console.log('cancel error', error);
         }));
    }
    catch (e) {}

    if ((i + 1) < ordersToCancel.length) {
      var o = ordersToCancel[i + 1];
      var id = o.id;
      ticker = o.symbol.split('/').join('').toLowerCase();
      os = orders[ticker][o.side === 'sell' ? 'asks' : 'bids'];
      console.log('cancelling', i + 2, '/', ordersToCancel.length, o.symbol, o.side, o.price, o.amount, o.id);
      try {
        r.push(exchange.cancelOrder(id)
         .then(result => {
           for (let i = 0; i < os.length; i++) {
             if (id === os[i]) {
               os.splice(i, 1);
               delete orders[ticker].map[id];
               break;
             }
           }

           console.log('cancel', ticker, o.side);
           sendMessageToWSockets(JSON.stringify(['cancel', id, ticker]));
         })
         .catch(error => {
           console.log('cancel error', error);
           var d = JSON.parse(error.message.substr(error.message.indexOf(' ') + 1));
           if (d && d.status === 3008) {
             console.log('order not active');
             for (let i = 0; i < os.length; i++) {
               if (id === os[i]) {
                 os.splice(i, 1);
                 delete orders[ticker].map[id];
                 sendMessageToWSockets(JSON.stringify(['closed', ticker, [id]]));
                 break;
               }
             }
           }
           else console.log('cancel error', error);
         }));
      }
      catch (e) {}
    }

    if ((i + 2) < ordersToCancel.length) {
      var o = ordersToCancel[i + 2];
      var id = o.id;
      ticker = o.symbol.split('/').join('').toLowerCase();
      os = orders[ticker][o.side === 'sell' ? 'asks' : 'bids'];
      console.log('cancelling', i + 3, '/', ordersToCancel.length, o.symbol, o.side, o.price, o.amount, o.id);
      try {
        r.push(exchange.cancelOrder(o.id)
         .then(result => {
           for (let i = 0; i < os.length; i++) {
             if (id === os[i]) {
               os.splice(i, 1);
               delete orders[ticker].map[id];
               break;
             }
           }

           console.log('cancel', ticker, o.side);
           sendMessageToWSockets(JSON.stringify(['cancel', id, ticker]));
         })
         .catch(error => {
           console.log('cancel error', error);
           var d = JSON.parse(error.message.substr(error.message.indexOf(' ') + 1));
           if (d && d.status === 3008) {
             console.log('order not active');
             for (let i = 0; i < os.length; i++) {
               if (id === os[i]) {
                 os.splice(i, 1);
                 delete orders[ticker].map[id];
                 sendMessageToWSockets(JSON.stringify(['closed', ticker, [id]]));
                 break;
               }
             }
           }
           else console.log('cancel error', error);
         }));
      }
      catch (e) {}
    }

    if ((i + 3) < ordersToCancel.length) {
      var o = ordersToCancel[i + 3];
      var id = o.id;
      ticker = o.symbol.split('/').join('').toLowerCase();
      os = orders[ticker][o.side === 'sell' ? 'asks' : 'bids'];
      console.log('cancelling', i + 4, '/', ordersToCancel.length, o.symbol, o.side, o.price, o.amount, o.id);
      try {
        r.push(exchange.cancelOrder(id)
         .then(result => {
           for (let i = 0; i < os.length; i++) {
             if (id === os[i]) {
               os.splice(i, 1);
               delete orders[ticker].map[id];
               break;
             }
           }

           console.log('cancel', ticker, o.side);
           sendMessageToWSockets(JSON.stringify(['cancel', id, ticker]));
         })
         .catch(error => {
           console.log('cancel error', error);
           var d = JSON.parse(error.message.substr(error.message.indexOf(' ') + 1));
           if (d && d.status === 3008) {
             console.log('order not active');
             for (let i = 0; i < os.length; i++) {
               if (id === os[i]) {
                 os.splice(i, 1);
                 delete orders[ticker].map[id];
                 sendMessageToWSockets(JSON.stringify(['closed', ticker, [id]]));
                 break;
               }
             }
           }
           else console.log('cancel error', error);
         }));
      }
      catch (e) {}
    }

    await Promise.all(r).catch(e => console.error('error cancelling order', e));
  }
}
