import "@testing-library/jest-dom";
import { TextDecoder, TextEncoder } from "util";

// jsdom (jest 27) lacks these; react-router v7 needs them at import time.
Object.assign(global, { TextEncoder, TextDecoder });
