import { Router } from "express";
import { listHotels, getHotelMenu, getNearbyHotels } from "../controllers/hotels.controller";
import { listHotelReviews, getMyHotelReview, upsertHotelReview, deleteMyHotelReview } from "../controllers/reviews.controller";
import { requireAuth, requireRole } from "../middleware/auth";

export const hotelsPublicRouter = Router();

// IMPORTANT: /nearby must be registered before /:hotelId/menu — Express
// matches routes in order, and /:hotelId would otherwise swallow the
// literal path segment "nearby" as if it were a hotel ID.
hotelsPublicRouter.get("/nearby", getNearbyHotels);
hotelsPublicRouter.get("/", listHotels);
hotelsPublicRouter.get("/:hotelId/menu", getHotelMenu);

// Reviews — reading is public (same reasoning as the menu: a student
// browsing hotels before onboarding should see ratings); writing and
// the "my review" lookup are student-only, guarded per route since this
// router is otherwise unauthenticated.
hotelsPublicRouter.get("/:hotelId/reviews", listHotelReviews);
hotelsPublicRouter.get("/:hotelId/reviews/me", requireAuth, requireRole("student"), getMyHotelReview);
hotelsPublicRouter.post("/:hotelId/reviews", requireAuth, requireRole("student"), upsertHotelReview);
hotelsPublicRouter.delete("/:hotelId/reviews/me", requireAuth, requireRole("student"), deleteMyHotelReview);
