import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as url from 'url';

import * as ws from 'ws';

import * as Gdax from 'gdax';

import * as _ from 'lodash';

const {ws_port, http_port, web_gui_dir} = process.env;

const wsServer = new ws.Server({port: ws_port || 8281}),
      sockets = [];

wsServer.on('connection', socket => {
  console.log('ws connection');

  sockets.push(socket);

  socket.on('disconnect', () => {
    const index = sockets.indexOf(socket);

    if (index >= 0) sockets.splice(index, 1);
  });
});

function broadcast(message) {
  sockets.forEach(socket => socket.readyState === ws.OPEN ? socket.send(message) : undefined);
}

const guiServer = http.createServer();

guiServer.on('request', (request, response) => {
  console.log(request);

  if (request.method === 'GET') {
    const parsed = url.parse(request.url);

    const filename = path.join(web_gui_dir, parsed.pathname === '/' ? '/index.html' : parsed.pathname);

    try {
      fs.createReadStream(filename).pipe(response);
    }
    catch (error) {
      console.error('request error', error);

      response.end();
    }
  }
});

guiServer.listen(http_port || 8282);
console.log('http server listening at', http_port || 8282);
console.log('ws server listening at', ws_port || 8281);

const {key, secret, passphrase} = process.env,
      apiURI = 'https://api.pro.coinbase.com',
      sandboxURI = 'https://api-public.sandbox.pro.coinbase.com',
      websocketURI = 'wss://ws-feed.pro.coinbase.com';

console.log({web_gui_dir});
// const authedClient = new Gdax.AuthenticatedClient(key, secret, passphrase, apiURI);

const orderbookSync = new (Gdax as any).OrderbookSync(['BTC-USD'], apiURI, websocketURI, {key, secret, passphrase});

const productTickers = createTickers(['BTC-USD', 'BCH-USD', 'BCH-BTC']);

function createTickers(products) {
  return products.reduce(
    (agg, product) =>
      (agg[product] = {side:{buy: {}, sell: {}}, info: {}}, agg),
    {});
}

const wsClient = new Gdax.WebsocketClient(
  Object.keys(productTickers),
  websocketURI,
  {key, secret, passphrase},
  {channels: ['ticker', 'level2']}
);

wsClient.on('message', data => {
  switch (data.type as any) {
    case 'heartbeat': return;
    case 'snapshot':
      broadcast(JSON.stringify(data));

      return;
    case 'l2update':
      broadcast(JSON.stringify(data));

      return;
    case 'ticker':
      console.log('ws message', {data});
      broadcast(JSON.stringify(data));
      const {product_id, side, price, best_bid, best_ask} = data as any;

      const stats = {price, best_bid, best_ask};

      Object.assign(productTickers[product_id].info, stats);

      if (side !== undefined) {
        const info = productTickers[product_id].side[side];

        Object.assign(info, stats);

        console.log(JSON.stringify(productTickers, undefined, 2));
      }

      if (product_id === 'BTC-USD' || product_id === 'BCH-USD') {
        const ip = impliedPrice('BCH-USD', 'BTC-USD'),
              ipab = impliedAskBid('BCH-USD', 'BTC-USD');

        console.log(ip, 'BCH-BTC implied price', productTickers['BCH-BTC'].info.price - ip, productTickers['BCH-BTC'].info.price);
        console.log(ipab, 'BCH-BTC implied ask_bid', productTickers['BCH-BTC'].info.best_ask - ipab, productTickers['BCH-BTC'].info.best_ask);



        // console.log(impliedPrice('BCH-USD', 'BTC-USD'), 'BCH-BTC implied price');
        // console.log(impliedAskBid('BCH-USD', 'BTC-USD'), 'BCH-BTC implied ask_bid');
      }
      break;
  }
});

wsClient.on('disconnect', () => {
  setInterval(() => console.log('ws disconnect'), 1000);
});

function impliedPrice(coin1, coin2) {
  return productTickers[coin1].info.price / productTickers[coin2].info.price
}

function impliedAskBid(coin1, coin2) {
  return productTickers[coin1].info.best_ask / productTickers[coin2].info.best_bid;
}

orderbookSync.on('error', error => console.log('orderbookSync error', {error}));

// console.log('state', orderbookSync.books['BTC-USD'].state());



// setInterval(() => console.log('state', orderbookSync.books['BTC-USD'].state()), 10000);

// const wsClient = new Gdax.WebsocketClient([/*'BTC-USD', 'BCH-USD', */'BCH-BTC']);

// wsClient.on('message', data => {
//   // console.log('message', data);
// });

// getAccounts()
//   .then(accounts => console.log({accounts}));

// getOrders()
//   .then(orders => {
//     const groups = _.groupBy(orders, 'product_id');

//     _.forEach(groups, (items, product_id) => {
//       const sides = _.groupBy(items, 'side');

//       // console.log({product_id, sides});

//       _.forEach(sides, (items, side) => console.log(product_id, side, items));
//     });
//     // console.log({groups});
//   });



// async function getAccounts() {
//   try {
//     const accounts = await authedClient.getAccounts();

//     return accounts;
//   }
//   catch (error) {
//     console.error('getAccounts', error);
//   }
// }

// async function getOrders() {
//   try {
//     return await authedClient.getOrders();
//   }
//   catch (error) {
//     console.error('getOrders', error);
//   }
// }