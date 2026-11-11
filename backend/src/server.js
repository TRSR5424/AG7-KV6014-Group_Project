const { makeApp } = require("./app");
const { createDatabase } = require("./db");

const port = Number(process.env.PORT || 3000);
const app = makeApp(createDatabase());
app.listen(port, () => console.log(`Backend listening on port ${port}`));
