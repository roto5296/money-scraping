var money = require('./index.js');
var fs = require('fs');
var rl = require('readline-sync');
var commander = require('commander');
var googleAuth = require('google-auth-library');

commander.option('-p, --password [value]', 'password JSON').parse(process.argv);
var pass = JSON.parse(fs.readFileSync(commander.password || 'password.json'));
var auth = new googleAuth.OAuth2Client(
  pass.googleapi.web.client_id,
  pass.googleapi.web.client_secret,
  pass.googleapi.web.redirect_uris[0]);
auth.credentials = JSON.parse(fs.readFileSync(process.env.HOME+"/.google_token.json"));
var list = ['bank-smbc', 'bank-aeon', 'e_money-suica', 'credit-smbc', 'credit-view', 'credit-rakuten', 'credit-pocket']
var type = commander.args[0];
if (!type) {
  type = list[rl.keyInSelect(list, 'Which type? ')];
}
switch (type) {
case "bank-smbc":
  var hoge = new money.bank.smbc(pass.bank.smbc);
  break;
case "bank-aeon":
  pass.bank.aeon.options.cookie_auth = auth;
  var hoge = new money.bank.aeon(pass.bank.aeon);
  break;
case "e_money-suica":
  pass.e_money.suica.options.cookie_auth = auth;
  var hoge = new money.e_money.suica(pass.e_money.suica);
  break;
case"credit-smbc":
  var hoge = new money.credit.smbc(pass.credit.smbc);
  break;
case "credit-view":
  var hoge = new money.credit.view(pass.credit.view);
  break;
case "credit-rakuten":
  var hoge = new money.credit.rakuten(pass.credit.rakuten);
  break;
case "credit-pocket":
  var hoge = new money.credit.pocket(pass.credit.pocket);
  break;
default:
  process.exit();
}
var year = parseInt(commander.args[1], 10)
var month = parseInt(commander.args[2], 10)
if (isNaN(year)) {
  year = rl.questionInt("year: ")
}
if (isNaN(month)) {
  month = rl.questionInt("month: ")
}
(async ()=>{
  await hoge.waitInit();
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
  var data = await hoge.getDetails(year, month);
  console.log(data);
  if (hoge.PJS) {
    await hoge.PJS.exit();
  }
})();
