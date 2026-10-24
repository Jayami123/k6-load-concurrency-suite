// Sampler overhead self-test (P6-X-LOAD-006): the same Task 3 open model as the telemetry self-test, run with and without the sampler.
// The runner decides whether a run has a sampler (K6RunSpec.telemetry); the script is the same either way.
export { default, options, setup, teardown } from "./telemetry.js";
