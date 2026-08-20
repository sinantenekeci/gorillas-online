/* WebSocket katmanı: otomatik yeniden bağlanma + basit olay yayını.
   Bağlantı koptuğunda gönderilemeyen mesaj sessizce düşer; kritik akış
   (odaya dönüş) yeniden bağlanınca app.js tarafından tekrar kurulur. */
(function (global) {
  "use strict";

  function Net() {
    this.ws = null;
    this.handlers = Object.create(null);
    this.tries = 0;
    this.closedByUser = false;
    this.state = "wait";
  }

  Net.prototype.on = function (type, fn) {
    (this.handlers[type] || (this.handlers[type] = [])).push(fn);
    return this;
  };

  Net.prototype.emit = function (type, data) {
    const list = this.handlers[type];
    if (list) for (let i = 0; i < list.length; i++) list[i](data);
  };

  Net.prototype.url = function () {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + location.host + "/ws";
  };

  Net.prototype.connect = function () {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    this.closedByUser = false;
    this.setState("wait");

    let ws;
    try { ws = new WebSocket(this.url()); }
    catch (e) { return this.scheduleRetry(); }
    this.ws = ws;

    ws.onopen = () => {
      this.tries = 0;
      this.setState("ok");
      this.emit("open");
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg && typeof msg.t === "string") {
        this.emit(msg.t, msg);
        this.emit("*", msg);
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) return;
      this.setState("bad");
      this.emit("close");
      this.scheduleRetry();
    };
    ws.onerror = () => { /* onclose zaten devrede */ };
  };

  Net.prototype.scheduleRetry = function () {
    const delay = Math.min(1000 * Math.pow(1.6, this.tries++), 15000);
    setTimeout(() => { if (!this.closedByUser) this.connect(); }, delay);
  };

  Net.prototype.setState = function (s) {
    if (this.state === s) return;
    this.state = s;
    this.emit("state", s);
  };

  Net.prototype.send = function (obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  };

  Net.prototype.close = function () {
    this.closedByUser = true;
    if (this.ws) { try { this.ws.close(); } catch (e) {} }
  };

  global.Net = Net;
})(window);
