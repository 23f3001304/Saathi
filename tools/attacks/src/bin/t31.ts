import { runT31 } from "../attacks/t31.js";
import { bootOrExit, finish, newTranscript } from "./boot.js";

const tx = newTranscript();
const harness = await bootOrExit(tx);
finish((await runT31(harness, tx)).blocked);
