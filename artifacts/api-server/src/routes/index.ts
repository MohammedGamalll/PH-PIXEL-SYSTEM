import { Router, type IRouter } from "express";
import healthRouter from "./health";
import employeesAdminRouter from "./employees-admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(employeesAdminRouter);

export default router;
