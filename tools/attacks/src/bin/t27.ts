import { runT27 } from "../attacks/t27.js";
import { bootOrExit, finish, newTranscript } from "./boot.js";

const tx = newTranscript();
const harness = await bootOrExit(tx);
finish((await runT27(harness, tx)).blocked);
