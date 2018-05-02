const request = require('request-promise');
const qs = require('querystring');
const cheerio = require('cheerio');
const url = require('url');

class line {
  constructor ({ id, password, options }) {
    this.id = id;
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
            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36`
          },
          jar: cookieJar
        })
      }
    });
  }

  async waitInit () {}

  async login () {
    let URL, HTML, postData, r;
    URL = "https://moneyforward.com/users/sign_in"
    HTML = (await this._request.get(URL)).body;
    postData = Object.assign(
      qs.parse(cheerio.load(HTML)('form').serialize()),
      {
        "sign_in_session_service[email]": this.id,
        "sign_in_session_service[password]": this.password,
        "commit": "ログイン"
      }
    );
    URL = "https://moneyforward.com/session";
    r = (await this._request.post(URL, {form: postData}));
    if (r.statusCode !== 302) {
      throw {message: "Login Error"};
    }
    URL = "https://moneyforward.com/";
    await this._request.get(URL);
    return true;
  }

  async getDetails(year, month){
    let HTML, URL, postData;
    //go to detail page
    URL = "https://moneyforward.com/cf";
    HTML = (await this._request.get(URL)).body;
    URL = "https://moneyforward.com/cf/fetch";
    postData = {
      from: year + "/" + month + "/1",
      service_id: "",
      account_id_hash: "" 
    }
    HTML = (await this._request.post(URL, {
      form: postData,
      headers: {
        "Accept": "text/javascript",
        "X-CSRF-Token": HTML.match(/<meta name="csrf-token" content="(.*?)" \/>/)[1],
        "X-Requested-With": "XMLHttpRequest"
      }})).body;
    const data = HTML.match(/\$\("\.list_body"\)\.append\('(.*?)'\);/)[1].replace(/\\n/g,'').replace(/\\/g,'').match(/<tr.*?<\/tr>/g);
    const output = [];
    for (let d of data) {
      let date = d.match(/<td class='date'.*?<span>(\d{2}\/\d{2}).*?<\/td>/)[1];
      let detail = d.match(/<td class='content'.*?<span>(.*?)<\/span>.*?<\/td>/)[1];
      let shiharai = d.match(/<td class='note calc'.*?>(.*?)<\/td>/);
      if (shiharai) {
        shiharai = shiharai[1];
      } else {
        shiharai = d.match(/<td class='calc' .*?><div.*?<div.*?>(.*?)<\/div><\/td>/)[1];
      }
      if (date.slice(0, 2) === ('0'+month).slice(-2)
          && shiharai === 'LINE Pay'
          && detail !== '決済 株式会社ジェーシービー'
          && detail !== '決済キャンセル 株式会社ジェーシービー'
         ) {
        output.push({
          date: year + '/' + date,
          price: d.match(/<td class='amount.*?((\+|\-)*\b\d{1,3}(,\d{3})*\b).*?<\/td>/)[1],
          detail: detail
        })
      }
    }
    return output.reverse();
  }
}

module.exports  = line;
