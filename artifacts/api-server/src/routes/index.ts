import { Router, type IRouter } from "express";
import healthRouter from "./health";
import parkinsonRouter from "./parkinson";
import authRouter, { requireSession } from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use(requireSession);
router.use(parkinsonRouter);

export default router;
