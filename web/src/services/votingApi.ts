import { API_BASE_URL } from "./config";

/**
 * Public hotel-voting API. Everything here hits the unauthenticated
 * /api/voting endpoints. Voting only needs the student's name, phone,
 * email and (optionally) a profile photo — no login, no OTP required.
 */

export interface VotableHotel {
  id: string;
  name: string;
  location: string | null;
  image_url: string | null;
  description: string | null;
  status: string;
  /** null when the admin has hidden public vote counts. */
  vote_count: number | null;
  review_count: number;
  average_rating: string | number | null;
}

export interface VoteStats {
  total_votes: number;
  hotels_with_votes: number;
}

export async function loadVotableHotels(): Promise<{ hotels: VotableHotel[]; votesPublic: boolean }> {
  const res = await fetch(`${API_BASE_URL}/api/voting/hotels`);
  if (!res.ok) throw new Error("Could not load hotels to vote for.");
  const data = await res.json();
  return { hotels: data.hotels ?? [], votesPublic: data.votesPublic !== false };
}

export async function loadVoteStats(): Promise<VoteStats> {
  const res = await fetch(`${API_BASE_URL}/api/voting/stats`);
  if (!res.ok) throw new Error("Could not load voting stats.");
  const data = await res.json();
  return {
    total_votes: Number(data.total_votes) || 0,
    hotels_with_votes: Number(data.hotels_with_votes) || 0,
  };
}

export interface CastVoteInput {
  hotelId: string;
  voterName: string;
  phone: string;
  email: string;
  profilePicture?: string | null;
}

export interface CastVoteResult {
  success: boolean;
  voteId: string;
  status: "pending" | "active";
  message: string;
}

export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  const res = await fetch(`${API_BASE_URL}/api/voting/cast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hotelId: input.hotelId,
      voterName: input.voterName,
      phone: input.phone,
      email: input.email,
      profilePicture: input.profilePicture ?? null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || "Your vote could not be recorded.");
  }
  return data;
}
