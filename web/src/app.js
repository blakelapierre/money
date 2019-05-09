import { h, render } from 'preact-cycle';

import {BigNumber} from 'bignumber.js';

let messageHandler = () => console.log('default handler'),
    bounce = (...args) => messageHandler(...args);

let socket = connectToWS();

function connectToWS() {
  socket = new WebSocket(`ws://${window.location.hostname}:8281`);

  socket.addEventListener('message', bounce);

  socket.addEventListener('close', event => {
    console.log('ws close');
    setTimeout(() => socket = connectToWS(), 1000);
  });

  return socket;
}

const calculateImpliedPrice = {
  // bch->usd->btc
  'BCH-BTC': books => books['BCH-USD'].best_ask.cents / books['BTC-USD'].best_bid.cents,
  // bch->btc->usd
  'BCH-USD': books => books['BCH-BTC'].best_ask.cents * books['BTC-USD'].best_ask.cents,
  // btc->bch->usd
  'BTC-USD': books => books['BCH-USD'].best_ask.cents / books['BCH-BTC'].best_bid.cents
  // btc->usd->bch
};

const createL2Book = product_id => ({buy: {}, sell: {}, best_bid: {cents: -Infinity}, best_ask: {cents: Infinity}, sortedBuyPrices: [], sortedSellPrices: []});

const initMap = (values, con) => values.reduce((a, b) => (a[b] = con(a, b), a), {});

function INIT(state, mutation, tickers) {
  state.inited = true;

  // state.priceHistory = {'BTC-USD': [], 'BCH-USD': [], 'BCH-BTC': []};
  state.priceHistory = initMap(tickers, () => []);
  // state.l2Book = tickers.reduce((agg, product_id) => (agg[product_id] = createL2Book(), agg), {});
  state.l2Book = initMap(tickers, createL2Book);
  // state.l2Book = {'BTC-USD': createL2Book(), 'BCH-USD': {buy:{}, sell:{}}, 'BCH-BTC': {buy:{}, sell:{}}};
  // state.orders = tickers.reduce((r, product_id) => (r[product_id] = {buy: {}, sell: {}}, r), {});
  state.orders = initMap(tickers, () => ({buy: {}, sell: {}}));
  state.newOrders = initMap(tickers, () => ({
    autoPrice: true,
    price: 0,
    priceStep: 0.005,
    size: 0.01,
    side: 'sell',
    trackBest: false,
    waitForCancel: true,
    growChain: true
  }));
  state.accounts = [];
  // state.userLog = tickers.reduce((r, product_id) => (r[product_id] = [], r), {});
  state.userLog = initMap(tickers, (a, b) => []);


  messageHandler = ({data}) => {
  // socket.addEventListener('message', ({data}) => {
    const parsed = JSON.parse(data),
          {type} = parsed;

    mutation(state => {
      state.lastData = parsed;

      if (parsed.type === 'ticker') {
        const {product_id, time, price} = parsed;

        state.priceHistory[product_id].unshift([new Date().getTime(), time, price]);
        if (state.priceHistory[product_id].length > 50) state.priceHistory[product_id].splice(50);
      }
      else if (parsed.type === 'snapshot') {
        const {product_id, bids, asks} = parsed,
              book = state.l2Book[product_id];

        bids.forEach(recordBid(book));
        asks.forEach(recordAsk(book));

        // bids.forEach(([price, amount]) => book['buy'][stringToCents(price)] = amount);
        // asks.forEach(([price, amount]) => book['sell'][stringToCents(price)] = amount);
      }
      else if (parsed.type === 'l2update') {
        const {product_id, time, changes} = parsed,
              book = state.l2Book[product_id];

        changes.forEach(([type, price, amount]) => {
          if (amount !== '0') (type === 'buy' ? recordBid : recordAsk)(book)([price, amount])
          // if (amount !== '0') book[type][stringToCents(price)] = amount;
          else {
            delete book[type][parseFloat(price)];
            // if (book[type])
          }
        });

        book.sortedBuyPrices = Object.keys(book['buy']).sort((a, b) => parseFloat(a) > parseFloat(b) ? 1 : -1).reverse();
        book.sortedSellPrices = Object.keys(book['sell']).sort((a, b) => parseFloat(a) > parseFloat(b) ? 1 : -1);

        book.best_ask.cents = book.sortedSellPrices[0];
        book.best_bid.cents = book.sortedBuyPrices[0];

        const newOrder = state.newOrders[product_id];

        if (newOrder.autoPrice) newOrder.price = (newOrder.side === 'sell' ? book.best_ask : book.best_bid).cents;
      }
      else if (parsed.type === 'orders') {
        const {orders} = parsed;

        Object.keys(state.orders).forEach(product_id => {
          state.orders[product_id].sell = {};
          state.orders[product_id].buy = {};
        });

        orders.forEach(order => {
          const {product_id, id, side} = order;

          state.orders[product_id][side][id] = order;
        });
      }
      else if (parsed.type === 'accounts') {
        console.log('accounts', parsed);
        const {time, accounts} = parsed;

        state.accounts = accounts;
      }
      else if (parsed.type === 'received') {
        state.userLog[parsed.product_id].push(parsed);
        state.orders[parsed.product_id][parsed.side][parsed.order_id] = {price: parsed.price, size: parsed.size, side: parsed.side}
      }
      else if (parsed.type === 'open') {
        state.userLog[parsed.product_id].push(parsed);
      }
      else if (parsed.type === 'done') {
        state.userLog[parsed.product_id].push(parsed);
        delete state.orders[parsed.product_id][parsed.side][parsed.order_id];
      }
      else if (parsed.type === 'match') {
        state.userLog[parsed.product_id].push(parsed);
      }
      else if (parsed.type === 'activate') {
        state.userLog[parsed.product_id].push(parsed);
      }
      else if (parsed.type === 'newOrder') {
        console.log('newOrder', {parsed});
      }
      else {
        console.log(parsed);
      }

      return state;
    })();
  };

  return state;
}

function recordBid(book) {
  return ([price, amount]) => {
    const cents = parseFloat(price);
    book['buy'][cents] = amount;
    if (cents > book.best_bid.cents) book.best_bid.cents = cents;
  }
}

function recordAsk(book) {
  return ([price, amount]) => {
    const cents = parseFloat(price);
    // const cents = stringToCents(price);
    book['sell'][cents] = amount;
    if (cents < book.best_ask.cents) book.best_ask.cents = cents;
  }
}

function stringToCents(s) {
  return s;
  // const [dollars, cents] = s.split('.');

  // return parseInt(dollars || '0') * 100 + parseInt((cents || '00').substr(0, 2));
}

const INIT_GUI = ({tickers}, {inited, mutation}) => inited ? <GUI /> : mutation(INIT)(mutation, tickers);

const REMOVE_ORDER = (_, id) => {
  socket.send(JSON.stringify({type: 'remove', id}));
};

const NEW_ORDER_CHANGE_PRICE = (_, product, event) => {
  console.log('price', product, event);
  _.newOrders[product].autoPrice = false;
  _.newOrders[product].price = event.target.value;
};

const NEW_ORDER_CHANGE_PRICE_STEP = (_, event) => {
  _.newOrders[product].priceStep = event.target.value;
};

const NEW_ORDER_CHANGE_SIZE = (_, product, event) => {
  console.log('size', product, event.target.value);
  _.newOrders[product].size = event.target.value;
};

const NEW_ORDER_CHANGE_SIDE = (_, product, event) => {
  _.newOrders[product].side = event.target.selectedOptions[0].value;
};

const NEW_ORDER_CHANGE_AUTO_PRICE = (_, product, event) => {
  _.newOrders[product].autoPrice = event.target.checked;
};

const NEW_ORDER_CHANGE_TRACK_BEST = (_, product, event) => {
  _.newOrders[product].trackBest = event.target.checked;
};

const NEW_ORDER_CHANGE_WAIT_FOR_CANCEL = (_, product, event) => {
  _.newOrders[product].waitForCancel = event.target.checked;
};

const NEW_ORDER_CHANGE_GROW_CHAIN = (_, product, event) => {
  _.newOrders[product].growChain = event.target.checked;
};

const NEW_ORDER_START = (_, product) => {
  const message = {type: 'order', id: new Date().getTime(), product_id: product, order: _.newOrders[product]};
  console.log({message});
  socket.send(JSON.stringify(message));
};

const GUI = ({}, {accounts, lastData, l2Book, newOrders, inited, mutation}) => (
  <gui>
    {!inited ? mutation(INIT)(mutation) : undefined}

    <banner>
      <prices>
        <PriceHistory product="BTC-USD" />
        <PriceHistory product="BCH-USD" />
        <PriceHistory product="BCH-BTC" />
      </prices>
      <Accounts accounts={accounts} />
    </banner>

    <books>
      <Book product="BTC-USD" book={l2Book["BTC-USD"]} newOrder={newOrders["BTC-USD"]} />
      <Book product="BCH-USD" book={l2Book["BCH-USD"]} newOrder={newOrders["BCH-USD"]} />
      <Book product="BCH-BTC" book={l2Book["BCH-BTC"]} newOrder={newOrders["BCH-BTC"]} />
    </books>
  </gui>
);

const Accounts = ({accounts}) => (
  <accounts>
    <headers>
      <td>Currency</td>
      <td>Available</td>
      <td>Balance</td>
      <td>Hold</td>
    </headers>
    {accounts.map(account => <Account account={account} />)}
  </accounts>
);

const Account = ({account}) => (
  <account>
    <currency>{formatStringDecimals(account.currency, 8)}</currency>
    <available>{formatStringDecimals(account.available, 8)}</available>
    <balance>{formatStringDecimals(account.balance, 8)}</balance>
    <hold>{formatStringDecimals(account.hold, 8)}</hold>
  </account>
);

function formatStringDecimals(s, n) {
  return s.substr(0, s.indexOf('.') + n + 1);
}

const Book = ({product, book, newOrder}, {l2Book}) => (
  <book>
    <product>{product}</product>
    {calculateImpliedPrice[product](l2Book)}
    <flex>
      <L2Book product={product} book={book} />
      <my-orders>
        <Orders product={product} />
        <NewOrder product={product} newOrder={newOrder} book={book} />
      </my-orders>
      <UserLog product={product} />
    </flex>
  </book>
);

const NewOrder = ({book, product, newOrder}, {mutation}) => (
  <new-order>
    <div>
      <label>Side:</label>
      <select onChange={mutation(NEW_ORDER_CHANGE_SIDE, product)} value={newOrder.side}>
        <option value="sell">sell</option>
        <option value="buy">buy</option>
      </select>
    </div>
    <div>
      <label>Price:</label>
      <input type="checkbox" checked={newOrder.autoPrice} onChange={mutation(NEW_ORDER_CHANGE_AUTO_PRICE, product)} />
      <input type="number" onInput={mutation(NEW_ORDER_CHANGE_PRICE, product)} onKeyup={mutation(NEW_ORDER_CHANGE_PRICE, product)} onChange={mutation(NEW_ORDER_CHANGE_PRICE, product)} value={newOrder.autoPrice ? (newOrder.side === 'sell' ? book.best_ask.cents : book.best_bid.cents) : newOrder.price} step={0.00001} />
    </div>
    <div>
      <label>Price Step:</label>
      <input type="number" step={0.00001} onChange={mutation(NEW_ORDER_CHANGE_PRICE_STEP, product)} value={newOrder.priceStep} />
    </div>
    <div>
      <label>Size:</label>
      <input type="number" step={0.01} onInput={mutation(NEW_ORDER_CHANGE_SIZE, product)} onKeyup={mutation(NEW_ORDER_CHANGE_SIZE, product)} onChange={mutation(NEW_ORDER_CHANGE_SIZE, product)} value={newOrder.size} />
    </div>
    <div>
      <label>Track Best:</label>
      <input type="checkbox" checked={newOrder.trackBest} onChange={mutation(NEW_ORDER_CHANGE_TRACK_BEST, product)} />
    </div>
    {newOrder.trackBest ? (
      <best-options>
      <label>Wait for Cancel</label>
      <input type="checkbox" checked={newOrder.waitForCancel} onChange={mutation(NEW_ORDER_CHANGE_WAIT_FOR_CANCEL, product)} />
      </best-options>
    ) : undefined}
    <div>
      <label>Grow Chain:</label>
      <input type="checkbox" checked={newOrder.growChain} onChange={mutation(NEW_ORDER_CHANGE_GROW_CHAIN, product)} />
    </div>
    <div>
      <button onClick={mutation(NEW_ORDER_START, product)}>start</button>
    </div>
  </new-order>
);

function subtractStrings(s1, s2, digits) {
  return BigNumber(s1).minus(BigNumber(s2)).toFixed(digits);
}

const UserLog = ({product}, {userLog}) => (
  <user-log>
    {userLog[product].map(item => <UserLogItem item={item} />)}
  </user-log>
);

const UserLogItem = ({item: {type, size, remaining_size, price, side}}) => (
  <user-log-item>
    {type} {price} {size || remaining_size} {side}
  </user-log-item>
);

const PriceHistory = ({product}, {priceHistory}) => (
  <price-history>
    {product}
    {priceHistory[product].map(([localTime, time, price]) => <div>-{((new Date().getTime() - localTime) / 1000).toFixed(1)}s {time} {price}</div>)}
  </price-history>
);

const Orders = ({product}, {orders}) => (
  <orders>
    {Object.keys(orders[product].sell).map(id => <Order id={id} data={orders[product].sell[id]} />)}
    {Object.keys(orders[product].buy).map(id => <Order id={id} data={orders[product].buy[id]} />)}
  </orders>
);

const Order = ({id, data: {price, size, side}}, {mutation}) => (
  <order title={id}>
   {price} {size} {side}<button onClick={mutation(REMOVE_ORDER, id)}>x</button>
  </order>
);

const L2Book = ({book}, {}) => (
  <l2-book>
    <sells onScroll={event => console.log(event)}>
      {book.sortedSellPrices.map(price => <sell><L2BookLine price={centsToString(price)} quantity={book['sell'][price]} /></sell>)}
    </sells>
    <spread>{subtractStrings(book.best_ask.cents, book.best_bid.cents, 5)}</spread>
    <buys>
      {book.sortedBuyPrices.map(price => <buy><L2BookLine price={centsToString(price)} quantity={book['buy'][price]} /></buy>)}
    </buys>
  </l2-book>
);

const L2BookLine = ({price, quantity}) => (
  <l>
    <pr>{BigNumber(price).toFixed(5)}</pr>
    <qu>{BigNumber(quantity).toFixed(8)}</qu>
  </l>
);

function centsToString(cents) {
  // return `${Math.floor(cents / 100)}.${cents % 100}`;
  return cents;
}

render(
  INIT_GUI, {tickers: ['BTC-USD', 'BCH-USD', 'BCH-BTC']}, document.body
  // GUI, {}, document.body
);


/*

track best:
  order at best -> new best -> (no risk of two filled orders) cancel order -> new order at best
                            -> (fastest to new price) new order at best -> cancel order


*/