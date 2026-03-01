import { createApp } from "./app.js";
import { PORT } from "./config.js";

const app = createApp();

app.listen(PORT, () => {
  console.log(`LobsterTank dashboard running at http://localhost:${PORT}`);
});
