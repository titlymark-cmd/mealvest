import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth";
import { ApiError } from "../middleware/errorHandler";
import * as orderService from "../services/orderService";

const createOrderSchema = z.object({
  hotelId: z.string().uuid(),
  items: z.array(z.object({ itemId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).min(1),
});

export async function createOrder(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", parsed.error.errors[0]?.message || "Invalid order.");
    }
    const order = await orderService.createOrder({
      userId: req.user!.id,
      hotelId: parsed.data.hotelId,
      lines: parsed.data.items,
    });
    res.status(201).json({ order });
  } catch (err) {
    next(err);
  }
}

export async function payOrder(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { orderId } = req.params;
    const order = await orderService.payOrderFromBudget(orderId, req.user!.id);
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const order = await orderService.getOrderById(req.params.orderId);
    if (order.user_id !== req.user!.id) {
      throw new ApiError(403, "FORBIDDEN", "This is not your order.");
    }
    res.json({ order });
  } catch (err) {
    next(err);
  }
}

export async function listMyOrders(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const orders = await orderService.getOrdersForUser(req.user!.id);
    res.json({ orders });
  } catch (err) {
    next(err);
  }
}
