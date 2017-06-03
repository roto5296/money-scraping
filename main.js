var money = require('./index.js');
var fs = require('fs');

var pass = JSON.parse(fs.readFileSync('password.json'));
//var hoge = new money.bank.smbc(pass.bank.smbc);
//pass.bank.aeon.options = {"cookie": "aeon-cookie.json"};
//var hoge = new money.bank.aeon(pass.bank.aeon);
(async ()=>{
  await hoge.login();
  var data = await hoge.getDetails(2017, 4);
  console.log(data);
})();
