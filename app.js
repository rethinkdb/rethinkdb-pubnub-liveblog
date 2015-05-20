
var r = require("rethinkdb");
var pubnub = require("pubnub");
var express = require("express");
var bodyParser = require("body-parser");
var stylus = require("stylus");
var jwt = require("express-jwt");

require("rethinkdb-init")(r);

var auth = require("./auth");
var config = require("./config");

var pn = pubnub(config.pubnub);
pn.grant({
  write: true, read: false,
  callback: function(c) { console.log("Permission set:", c); }
});

var app = express();
app.use(bodyParser.json());
app.use(stylus.middleware(__dirname + "/public"));
app.use(express.static(__dirname + "/public"));

app.listen(config.port, function() {
  console.log("Server started on port " + config.port);
});

function validStr(s) {
  return typeof s === "string" && s.trim();
}

r.init(config.database, [
    {name: "users", indexes: ["username"]},
    "updates"
])
.then(function(conn) {
  return r.table("updates").changes()("new_val").run(conn);
})
.then(function(changes) {
  changes.each(function(err, item) {
    console.log("Received:", item);
    pn.publish({channel: "updates", message: item,
    error: function(err) { console.log("Failure:" , err); }});
  });
});

function authHandler(authfn) {
  return function(req, res) {
    if (!(validStr(req.body.username) && validStr(req.body.password)))
      return res.status(400).json({success: false,
        error: "Must provide username and password"});

    authfn(req.body.username, req.body.password).then(function(acct) {
      pn.grant({
        channel: "updates", auth_key: acct.token,
        read: true, write: acct.user.admin,
        callback: function(c) { console.log("Set permissions:", c); }
      });
      res.json({success: true, token: acct.token, user: acct.user});
    })
    .catch(function(err) {
      console.log(err);
      res.status(400).json({success: false, error: err});
    });
  };
}

app.post("/api/user/create", authHandler(auth.create));
app.post("/api/user/login", authHandler(auth.login));

app.use(jwt({secret: config.jwt.secret, credentialsRequired: false}));

app.post("/api/send", function(req, res) {
  if (!req.user.admin)
    return res.status(401).json({success: false, error: "Unauthorized User"});

  if (!validStr(req.body.message))
    return res.status(400).json({success: false,
      error: "Must include a message to send"});

  r.connect(config.database).then(function(conn) {
    return r.table("updates").insert({
      text: req.body.message,
      sender: req.user.username,
      time: r.now()
    }).run(conn).finally(function() { conn.close(); });
  })
  .then(function() { res.json({success: true}); });
});

app.get("/api/history", function(req, res) {
  if (!req.user)
    return res.status(401).json({success: false, error: "Unauthorized User"});

  r.connect(config.database).then(function(conn) {
    return r.table("updates").orderBy(r.desc("time")).run(conn)
      .finally(function() { conn.close(); });
  })
  .then(function(stream) { return stream.toArray(); })
  .then(function(output) { res.json(output); });
});
