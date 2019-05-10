var ccxt = require('ccxt');


(async function () {
  console.log(ccxt.exchanges);

  var fcoin = new ccxt.fcoin(),
      gdax = new ccxt.gdax();


  var markets = {
    fcoin: await fcoin.loadMarkets(),
    gdax: await gdax.loadMarkets()
  };

  console.log('markets', markets);

  console.log('cross markets', crossMarkets(markets));
})();



function crossMarkets (markets) {
  var cross = [];

  for (var name in markets) {
    for (var otherName in markets) {
      if (name === otherName) continue;

      var m1 = markets[name],
          m2 = markets[otherName];

      for (var p1 in m1) {
        for (var p2 in m2) {
          var pair1 = m1[p1],
              pair2 = m2[p2];

          if (pair1.quote === pair2.base) {
            cross.push([name, otherName, pair1.base, '->', pair2.quote, p1, p2]);
          }
        }
      }
    }
  }

  return cross;
}