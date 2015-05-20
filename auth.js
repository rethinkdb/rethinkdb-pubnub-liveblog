var r = require("rethinkdb");
var jwt = require("jsonwebtoken");
var bluebird = require("bluebird");
var bcrypt = bluebird.promisifyAll(require("bcrypt"));

var config = require("./config");

function userFind(username) {
  return r.connect(config.database).then(function(conn) {
    return r.table("users").getAll(username, {index: "username"})(0)
            .default(null).run(conn)
    .finally(function() { conn.close(); });
  });
}

function userMake(username, hash) {
  var user = {
    username: username, password: hash,
    admin: config.admins.indexOf(username) >= 0
  };

  return r.connect(config.database).then(function(conn) {
    return r.table("users").insert(user, {returnChanges: true})
      ("changes")(0)("new_val").run(conn)
    .finally(function() { conn.close(); });
  });
}

module.exports = {
  create: function(username, password) {
    return userFind(username).then(function(user) {
      if (user) throw "User already exists";
    })
    .then(function() {
      return bcrypt.hashAsync(password, 10);
    })
    .then(function(hash) {
      return userMake(username, hash);
    })
    .then(function(user) {
      return {user: user, token: jwt.sign(user, config.jwt.secret)};
    });
  },

  login: function(username, password) {
    var user;
    return userFind(username).then(function(u) {
      if (!(user = u)) throw "User doesn't exist";
      return bcrypt.compareAsync(password, u.password);
    })
    .then(function(auth) {
      if (!auth) throw "Authentication failed";
    })
    .then(function() {
      return {user: user, token: jwt.sign(user, config.jwt.secret)};
    });
  }
};
