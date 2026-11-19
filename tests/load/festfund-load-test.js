import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "https://staging.example.test/api";
const TOKEN = __ENV.AUTH_TOKEN || "";

export const options = {
  scenarios: {
    v50: { executor: "constant-vus", vus: 50, duration: __ENV.DURATION_50 || "2m", exec: "exerciseApi", tags: { load_tier: "50" } },
  },
};

export const load50 = { scenarios: { v50: { executor: "constant-vus", vus: 50, duration: "2m", exec: "exerciseApi" } } };
export const load100 = { scenarios: { v100: { executor: "constant-vus", vus: 100, duration: "2m", exec: "exerciseApi" } } };
export const load200 = { scenarios: { v200: { executor: "constant-vus", vus: 200, duration: "2m", exec: "exerciseApi" } } };

export function exerciseApi() {
  const festId = __ENV.TEST_FEST_ID || "FEST-STAGING-SYNTHETIC";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };
  const requests = [
    ["GET", "/auth/me", null],
    ["GET", `/analytics/forecast?festId=${encodeURIComponent(festId)}`, null],
    ["GET", `/donors?festId=${encodeURIComponent(festId)}&limit=20`, null],
    ["GET", `/analytics/financial-advisor?festId=${encodeURIComponent(festId)}`, null],
  ];
  for (const [method, path, body] of requests) {
    const response = http.request(method, `${BASE_URL}${path}`, body, { headers, tags: { endpoint: path.split("?")[0] } });
    check(response, { "staging API response is not 5xx": (r) => r.status < 500 });
  }
  sleep(1);
}

export default exerciseApi;
