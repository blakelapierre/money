import { h, render } from 'preact-cycle';

function connectToWS (messageHandlers) {
  const ws = new WebSocket('ws://' + window.location.hostname + ':8185/ws');

  ws.addEventListener('message', event => {
    try {
      const data = JSON.parse(event.data),
            [type] = data;

      if (type.indexOf('ticker.') === 0) {
        const [_, ticker] = type.split('.');

        messageHandlers['ticker'](ticker, data);
      }
      else {
        (messageHandlers[type] || (data => console.log('no handler for', data)))(data);
      }
    }
    catch (e) {

    }
  });

  return ws;
}

const {
  INIT,
  ADD_TICKER_DATA,
  BUY
} = {
  INIT (_, mutation) {
    _._inited = true;
    _._mutation = mutation;

    _.tickers = [];
    _.prices = {};

    _.ws = connectToWS({
      ticker: mutation(ADD_TICKER_DATA),
      buy: mutation(BUY),
      sell: () => {},
      closed: () => {},
      cancel: () => {},
      missedOrders: () => {},
      orders: () => {},
      balances: () => {},
      'balance low': () => {}
    });

    return _;
  },

  ADD_TICKER_DATA (_, ticker, [t, ask, bid, volume]) {
//    _.tickers.push(data);

    (_.prices[ticker] = _.prices[ticker] || {}).ask = ask;
    _.prices[ticker].bid = bid;

    return _;
  },

  BUY (_, [b, ticker, price, amount, id]) {
    
  }
};

const Price = ({ticker, prices: {ask, bid}}) => (
  <price>
    <div>{ticker}</div>
    <div>
      <ask>{ask}</ask>
      <bid>{bid}</bid>
    </div>
  </price>
);

const Prices = ({}, {prices}) => (
  <prices>
    {Object.keys(prices).map(ticker => <Price ticker={ticker} prices={prices[ticker]} />)}
  </prices>
);

const Market = ({data}) => (
  <market>
    <QuoteBalance />
    <CurrentAsks />
    <CurrentBids />
    <BaseBalance />
  </market>
);

const Marketss = ({}, {marketss}) => (
  <markets>
    {markets.map(t => <Market data={t} />)}
  </markets>
);

const GUI = () => (
  <gui>
    <Markets />
  </gui>
);

const INIT_GUI = ({}, {_inited, mutation}) => _inited ? <GUI /> : mutation(INIT)(mutation);

render(
  INIT_GUI, {
   
  }, document.body
);
