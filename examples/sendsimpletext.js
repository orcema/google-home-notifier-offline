var googlehomenotifier = require('../')("192.168.178.131", "en-US", 1);

googlehomenotifier.notify("Some crazy textmessage", function (result) {
  console.log(result);
})
