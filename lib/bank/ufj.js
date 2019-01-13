const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const Iconv = require('iconv').Iconv;
const url = require('url');
const {google} = require('googleapis');
const util = require('util');

class ufj {
  constructor ({ no, password, options }) {
    this.no = no;
    this.password = password;
    this.options = options || {};
    const cookieJar = request.jar();
    Object.defineProperties(this, {
      '_cookieJar': {
        value: cookieJar
      },
      '_request': {
        value: request.defaults({
          simple: false,
          resolveWithFullResponse: true,
          headers: {
            'User-Agent': `Mozilla/5.0 SMBC/1.0`
          },
          jar: cookieJar
        })
      },
      '_iconv': {
        value: new Iconv('SHIFT_JIS','UTF-8//TRANSLIT//IGNORE')
      }
    });
  }

  async waitInit () {}

  async waitNewMail (label_id, time, count) {
    await new Promise(resolve => {setTimeout(resolve, 10000)}); //10s x 10 times
    const gmail = google.gmail({version:'v1', auth:this.options.gmail_auth});
    var run = util.promisify(gmail.users.messages.list);
    var ret = await run({userId: "me", labelIds: [label_id]});
    var i = ret.data.messages[0].id;
    run = util.promisify(gmail.users.messages.get);
    ret = await run({userId: "me", id: i});
    if(ret.data.internalDate > time) {
      return new Buffer(ret.data.payload.body.data, 'base64').toString();
    } else {
      if (count < 10) {
        var r = await this.waitNewMail(label_id, time, count+1);
        return r;
      } else {
        return false;
      }
    }
  }

  async login () {
    let URL, HTML, postData;
    URL = "https://entry11.bk.mufg.jp/ibg/dfw/APLIN/loginib/login?_TRANID=AA000_001";
    HTML = (await this._request.get(URL)).body;
    postData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        _TRANID: "AA011_001",
        KEIYAKU_NO: this.no,
        PASSWORD: this.password
      }
    );
    var r = await this._request.post("https://entry11.bk.mufg.jp/ibg/dfw/APLIN/loginib/login", {form: postData, encoding: null});
    if (r.statusCode !== 302) {
      if (qs.parse(cheerio.load(r.body)('form').serialize())['_PAGEID'] === "AA012") { //need onetime password
        const gmail = google.gmail({version:'v1', auth:this.options.gmail_auth});
        var run = util.promisify(gmail.users.labels.list);
        var ret = await run({userId: "me"});
        var index = ret.data.labels.findIndex(i => i.name === "ufj-onetime");
        var id = ret.data.labels[index].id;
        ret = await this.waitNewMail(id, new Date().getTime(), 0); //get onetime password mail
        if (ret) {
          var code = ret.match(/L-\d{6}/g)[0].replace(/L-/g, "");
          postData = Object.assign(
            qs.parse(cheerio.load(r.body)('form').serialize()),
            {
              _TRANID: "AA012_001",
              PASSWORD: code
            }
          );
          r = await this._request.post("https://entry11.bk.mufg.jp/ibg/dfw/APLIN/loginib/login", {form: postData, encoding: null});
          if (r.statusCode !== 302) {
            throw {message: "Onetime Error"};
          }
        } else {
          throw {message: "Cannot recieve ontime mail"};
        }
      } else {
        throw {message: "Login Error"};
      }
    }
    return true;
  }
  
  async getDetails(year, month){
    let HTML, $, postData;
    //go to TopPage
    HTML = (await this._request.get("https://direct11.bk.mufg.jp/ib/dfw/APL/bnkib/banking?_TRANID=AE041_001", {encoding: null})).body;
    postData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        _TRANID: "AD001_066"
      }
    );
    HTML = (await this._request.post("https://direct11.bk.mufg.jp/ib/dfw/APL/bnkib/banking", {form: postData, encoding: null})).body;
    //get Query to get details
    const today = new Date();
    if (today.getFullYear() === year && today.getMonth()+1 === month) { //this month
      postData = Object.assign(
        qs.parse(cheerio.load(HTML)('form').serialize()),
        {
          _TRANID: "CP105_002",
          SHOUKAIKIKAN_RADIO: 3
        }
      );
    } else if ((today.getFullYear() - year) * 12 + today.getMonth()+1 - month === 1) { //last month
      postData = Object.assign(
        qs.parse(cheerio.load(HTML)('form').serialize()),
        {
          _TRANID: "CP105_002",
          SHOUKAIKIKAN_RADIO: 4
        }
      );
    } else {
      throw {message: "Cannot access more than two months old data"};
    }
    //go to details page
    HTML = (await this._request.post("https://direct11.bk.mufg.jp/ib/dfw/APL/bnkib/banking", {form: postData, encoding: null})).body;
    $ = cheerio.load(this._iconv.convert(HTML).toString());
    //create data
    let output = [];
    $('.data.memo tr').slice(1).each(function(){
      const columns = $(this).children();
      const dateString = columns.eq(0).text();
      const date = dateString.split('年')[0]
            + "/"
            + ('0'+dateString.split('年')[1].split('月')[0]).slice(-2)
            + "/"
            + ('0'+dateString.split('年')[1].split('月')[1].split('日')[0]).slice(-2);
      let price;
      if (columns.eq(1).text() !== "　") {
        price = parseInt(columns.eq(1).text().replace(/,/g, "").replace(/円/g, ""), 10) * -1;
      } else {
        price = parseInt(columns.eq(2).text().replace(/,/g, "").replace(/円/g, ""), 10);
      }
      output.push({
        date: date,
        price: price,
        detail: columns.eq(3).text()
      });
    });
    return output;
  }
}

module.exports  = ufj;
