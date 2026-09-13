import { Router } from "express";
import { listHotels, getHotelMenu, getNearbyHotels } from "../controllers/hotels.controller";

export const hotelsPublicRouter = Router();

// IMPORTANT: /nearby must be registered before /:hotelId/menu — Express
// matches routes in order, and /:hotelId would otherwise swallow the
// literal path segment "nearby" as if it were a hotel ID.
hotelsPublicRouter.get("/nearby", getNearbyHotels);
hotelsPublicRouter.get("/", listHotels);
hotelsPublicRouter.get("/:hotelId/menu", getHotelMenu);
