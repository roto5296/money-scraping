var money = require('./index.js');
var fs = require('fs');

var pass = JSON.parse(fs.readFileSync('password.json'));
//var hoge = new money.bank.smbc(pass.smbc);
//pass.aeon.options = {"cookie": "aeon-cookie.json"};
//var hoge = new money.bank.aeon(pass.aeon);
(async ()=>{
  await hoge.login();
  var data = await hoge.getDetails(2017, 5);
  console.log(data);
})();
