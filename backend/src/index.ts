import 'dotenv/config';
import {createApp} from './server.js';

const port = Number(process.env.API_PORT ?? 4000);
createApp().listen(port, () => {
  console.log(`API listening on ${port}`);
});
