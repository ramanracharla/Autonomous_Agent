import { Router } from "express";

export function createHealthRouter(readinessCheck: () => boolean = () => false): Router {
  const router = Router();

  router.get("/health", (_request, response) => {
    response.status(200).json({
      success: true,
      service: "icepot-api-gateway",
      status: "UP"
    });
  });

  router.get("/ready", (_request, response) => {
    const ready = readinessCheck();
    response.status(ready ? 200 : 503).json({
      success: ready,
      service: "icepot-api-gateway",
      status: ready ? "READY" : "NOT_READY"
    });
  });

  return router;
}
