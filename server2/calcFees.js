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
      trade: true,
      priceStep: 0.1,
      tradeAmount: 0.01
    }
    ,'BTC/USDC': {
      trade: true,
      priceStep: 0.1,
      tradeAmount: 0.01
    }
    ,'USDC/USDT': {
      trade: true,
      priceStep: 0.0001,
      tradeAmount: 100
    }
    ,'TUSD/USDT': {
      trade: true,
      priceStep: 0.0001,
      tradeAmount: 100
    }
    ,'PAX/USDT': {
      trade: true,
      priceStep: 0.0001,
      tradeAmount: 100
    }
    ,'FT/PAX': {
      trade: true,
      priceStep: 0.001,
      tradeAmount: 400
    }
  }
};


(async function () {
  var all = await getAllClosedFilledOrders(fcoin, 'BCH/USDT');

  console.log('BCH/USDT', all);
})();

async function getAllClosedFilledOrders (exchange, market) {
  var allOrders = [], orders, after = 0;

  while (true) {
    console.log('fetching', market, 'orders after page', after);

    orders = await exchange.fetchClosedOrders(market, new Date().getTime() - (24 * 60 * 60 * 1000), 1000, {states: ['filled', 'partial_filled', 'partial_canceled'], before: after});

    console.log(orders);
    console.log('got', orders.length, 'orders',);

    if (orders.length < 100) return allOrders;

    allOrders = allOrders.concat(orders);

    after++;
  }
}


// (async function (exchange, markets) {
//   var market, symbols;

//   for (var i = 0; i < markets.length; i++) {
//     market = markets[i];
//     symbols = market.split('/');

//     var f = await exchange.fetchClosedOrders(market, undefined, undefined, {states: ['filled', 'partial_filled', 'partial_canceled']});

//     if (f.length === 100) {
//       f = f.concat(await exchange.fetchClosedOrders(market, undefined, undefined, {states: ['filled', 'partial_filled', 'partial_canceled'], after: 1}));
//     }

//     if (f.length > 0) {

//       var duration = (f[f.length - 1].timestamp - f[0].timestamp) / 1000 / 60;

//       var orders = _.groupBy(f, 'side');
//       var transactionAmounts = {
//         'sell': 0,
//         'buy': 0
//       };

//       var fees = {
//         market,
//         duration,
//         'lastXOrders': 0,
//         [symbols[0]]: 0,
//         [symbols[1]]: 0
//       };

//       for (var side in orders) {
//         var o = orders[side];

//         transactionAmounts[side] = _.reduce(o, (agg, oo) => agg + parseFloat(oo.price) * parseFloat(oo.amount), 0);

//         var fTotalIncome = _.reduce(o, (agg, oo) => agg + parseFloat(oo.info.fees_income), 0);
//         var fTotalFees = _.reduce(o, (agg, oo) => agg - parseFloat(oo.info.fill_fees), 0);

//         fees[side === 'sell' ? symbols[0] : symbols[1]] += fTotalIncome;
//         fees[side === 'sell' ? symbols[1] : symbols[0]] += fTotalFees;

//         fees['lastXOrders'] += o.length;
//       }

//       fees['estimatedDailyRate'] = {
//         [symbols[1]]: (24 * 60) / duration * fees[symbols[1]],
//         [symbols[0]]: (24 * 60) / duration * fees[symbols[0]]
//       };

//       var tradeGain = transactionAmounts['sell'] - transactionAmounts['buy'];
//       var estimatedDailyTradeGain = tradeGain * ((24 * 60) / duration);

//       console.log(fees, {tradeGain, estimatedDailyTradeGain});
//     }
//   }
// })(fcoin, Object.keys(_.pickBy(config['fcoin'], value => value.trade)));