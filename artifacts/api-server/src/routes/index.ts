import { Router, type IRouter } from "express";
import healthRouter from "./health";
import parkinsonRouter from "./parkinson";

const router: IRouter = Router();

router.use(healthRouter);
router.use(parkinsonRouter);

export default router;
