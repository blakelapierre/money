import { h, render } from 'preact-cycle';

const socket = new WebSocket(`ws://${window.location.hostname}:8281`);

function INIT(state, mutation) {
  state.inited = true;

  state.priceHistory = {'BTC-USD': [], 'BCH-USD': [], 'BCH-BTC': []};
  state.l2Book = {'BTC-USD': {buy:{}, sell:{}}, 'BCH-USD': {buy:{}, sell:{}}, 'BCH-BTC': {buy:{}, sell:{}}};

  socket.addEventListener('message', ({data}) => {
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

        bids.forEach(([price, amount]) => book['buy'][stringToCents(price)] = amount);
        asks.forEach(([price, amount]) => book['sell'][stringToCents(price)] = amount);
      }
      else if (parsed.type === 'l2update') {
        const {product_id, time, changes} = parsed,
              book = state.l2Book[product_id];

        changes.forEach(([type, price, amount]) => {
          if (amount !== '0') book[type][stringToCents(price)] = amount;
          else delete book[type][stringToCents(price)];
        });
      }

      return state;
    })();
  });

  return state;
}

function stringToCents(s) {
  return s;
  // const [dollars, cents] = s.split('.');

  // return parseInt(dollars || '0') * 100 + parseInt((cents || '00').substr(0, 2));
}

const INIT_GUI = ({}, {inited, mutation}) => inited ? <GUI /> : mutation(INIT)(mutation);

const GUI = ({}, {lastData, inited, mutation}) => (
  <gui>
    {!inited ? mutation(INIT)(mutation) : undefined}
    {JSON.stringify(lastData)}

    <prices>
      <PriceHistory product="BTC-USD" />
      <PriceHistory product="BCH-USD" />
      <PriceHistory product="BCH-BTC" />
    </prices>

    <books>
      <L2Book product="BTC-USD" />
      <L2Book product="BCH-USD" />
      <L2Book product="BCH-BTC" />
    </books>
  </gui>
);

const PriceHistory = ({product}, {priceHistory}) => (
  <price-history>
    {product}
    {priceHistory[product].map(([localTime, time, price]) => <div>-{((new Date().getTime() - localTime) / 1000).toFixed(1)}s {time} {price}</div>)}
  </price-history>
);

const L2Book = ({product}, {l2Book}) => (
  <l2-book>
    {product}
    <sells>
      {Object.keys(l2Book[product]['sell']).sort((a, b) => parseFloat(a) > parseFloat(b) ? 1 : -1).reverse().map(price => <sell>{centsToString(price)} {l2Book[product]['sell'][price]}</sell>)}
    </sells>
    <buys>
      {Object.keys(l2Book[product]['buy']).sort((a, b) => parseFloat(a) > parseFloat(b) ? 1 : -1).reverse().map(price => <buy>{centsToString(price)} {l2Book[product]['buy'][price]}</buy>)}
    </buys>
  </l2-book>
);

function centsToString(cents) {
  // return `${Math.floor(cents / 100)}.${cents % 100}`;
  return cents;
}

render(
  INIT_GUI, {}, document.body
  // GUI, {}, document.body
);