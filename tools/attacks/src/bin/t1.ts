import { runT1 } from "../attacks/t1.js";
import { bootOrExit, finish, newTranscript } from "./boot.js";

const tx = newTranscript();
const harness = await bootOrExit(tx);
finish((await runT1(harness, tx)).blocked);
