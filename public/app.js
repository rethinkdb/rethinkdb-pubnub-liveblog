Vue.filter("moment", function(value, fmt) {
  return moment(value).format(fmt).replace(/'/g, "");
});

var app = new Vue({
  el: "body",
  data: {
    user: {},
    token: null,
    message: null,
    messages: [],
    authError: null,
    authShow: "login"
  },

  ready: function() {
    var user = window.sessionStorage.getItem("user");
    var token = window.sessionStorage.getItem("token");

    if (user && token)
      this.connect({user: JSON.parse(user), token: token});
  },

  methods: {
    connect: function(response) {
      this.user = response.user;
      this.token = response.token;

      window.sessionStorage.setItem("user", JSON.stringify(response.user));
      window.sessionStorage.setItem("token", response.token);

      var pn = PUBNUB.init({
        subscribe_key: "sub-c-751bd564-f6c1-11e4-b945-0619f8945a4f",
        auth_key: response.token
      });

      var that = this;
      pn.subscribe({
        channel: "updates",
        message: function(message, env, channel) {
          console.log("Message:", message);
          that.messages.unshift(message);
        }
      });

      fetch("/api/history", {
        headers: {
          "Authorization": "Bearer " + this.token
        }
      })
      .then(function(output) { return output.json(); })
      .then(function(messages) {
        if (messages.success !== false)
          that.messages = messages;
      });
    },

    send: function(ev) {
      fetch("/api/send", {
        method: "post",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + this.token
        },
        body: JSON.stringify({message: this.message})
      })
      .then(function(output) { return output.json(); })
      .then(function(response) {
        console.log("Sent:", response);
        app.message = null;
      });
    },

    login: function(path, ev) {
      this.authError = null;

      fetch("/api/user/" + path, {
        method: "post",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: this.username,
          password: this.password
        })
      })
      .then(function(output) { return output.json(); })
      .then(function(response) {
        if (!response.success)
          app.authError = response.error;
        else {
          app.authShow = null;
          app.connect(response);
        }
      });
    }
  }
});
