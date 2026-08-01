const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "Express works",
  });
});

app.listen(4000, () => {
  console.log("Listening on 4000");
});
