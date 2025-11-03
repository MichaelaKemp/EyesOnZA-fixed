import * as dotenv from "dotenv";
import appConfig from "./app.base.json";

dotenv.config();

export default {
  ...appConfig,
  expo: {
    ...appConfig.expo,
    extra: {
      GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    },
  },
};