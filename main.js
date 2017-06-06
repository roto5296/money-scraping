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
    try {
      await hoge.login(imageString, form);
      flag = 0;
    } catch(e) {
      if (e.message !== 'Need Image Authorization') {
        console.log(e);
        return;
      }
      fs.writeFileSync('/home/shared/tmp.jpg', e.img, 'binary');
      imageString = rl.question("input image string ");
      form = e.form;
    }
  }
  var data = await hoge.getDetails(2017, 6);
  console.log(data);
})();
