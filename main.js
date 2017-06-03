var money = require('./index.js');
var fs = require('fs');
var rl = require('readline-sync');

var pass = JSON.parse(fs.readFileSync('password.json'));
if (process.argv[2] === "smbc") {
  var hoge = new money.bank.smbc(pass.bank.smbc);
} else if (process.argv[2] === "aeon") {
  pass.bank.aeon.options = {"cookie": "aeon-cookie.json"};
  var hoge = new money.bank.aeon(pass.bank.aeon);
} else if (process.argv[2] === "suica") {
  pass.e_money.suica.options = {"cookie": "suica-cookie.json"};
  var hoge = new money.e_money.suica(pass.e_money.suica);
} else {
  process.exit();
}
(async ()=>{
  var flag = 1;
  var imageString = null;
  var form = null;
  while (flag) {
    var ret = await hoge.login(imageString, form);
    if (ret) {
      fs.writeFileSync('/home/shared/tmp.jpg', ret.img, 'binary');
      imageString = rl.question("input image string ");
      form = ret.form;
    } else {
      flag = 0;
    }
  }
  var data = await hoge.getDetails(2017, 5);
  console.log(data);
})();
