import { useState } from 'react';
import { Form, Link, redirect, useLoaderData, useActionData } from "react-router";
import type { Route } from "./+types/allfriends";
import { getSession } from "~/utils/session.server";
import type { User } from "~/utils/models/user.model";

type PublicUser = {
    id: string
    username: string
    avatarUrl: string | null
    bio: string | null
    createdAt: string | null
}

export async function loader({ request }: Route.LoaderArgs) {
    const session = await getSession(request.headers.get("Cookie"))
    const user: User | null = session.has("user") ? session.get("user") : null

    if (!user) throw redirect("/sign-in")

    const cookie = request.headers.get("Cookie") ?? ""
    const authorization = session.get("authorization") ?? ""
    const response = await fetch(`${process.env.REST_API_URL}/friend`, {
        headers: { Cookie: cookie, Authorization: authorization },
    })

    if (!response.ok) {
        return { user, friends: [] as PublicUser[], pendingRequests: [] as PublicUser[] }
    }

    const result = await response.json()
    const friends: PublicUser[] = result?.data?.friends ?? []
    const pendingRequests: PublicUser[] = result?.data?.pendingRequests ?? []

    return { user, friends, pendingRequests }
}

export async function action({ request }: Route.ActionArgs) {
    const session = await getSession(request.headers.get("Cookie"))
    const user: User | null = session.has("user") ? session.get("user") : null

    if (!user) throw redirect("/sign-in")

    const formData = await request.formData()
    const intent = formData.get("intent")

    if (intent === "sendFriendRequest") {
        const email = formData.get("email") as string
        const requestorId = formData.get("requestorId") as string
        const authorization = session.get("authorization") ?? ""
        const response = await fetch(`${process.env.REST_API_URL}/friend/email`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: request.headers.get("Cookie") ?? "",
                Authorization: authorization,
            },
            body: JSON.stringify({ email, requestorId }),
        })
        if (!response.ok) {
            return { message: "Failed to send friend request", status: response.status, intent: "sendFriendRequest" }
        }
        const result = await response.json()
        return { message: result.message, status: result.status, intent: "sendFriendRequest" }
    }

    const authorization = session.get("authorization") ?? ""
    const headers = {
        "Content-Type": "application/json",
        Cookie: request.headers.get("Cookie") ?? "",
        Authorization: authorization,
    }
    const requestorId = formData.get("requestorId") as string

    if (intent === "acceptFriend") {
        const response = await fetch(`${process.env.REST_API_URL}/friend`, {
            method: "PUT", headers,
            body: JSON.stringify({ requestorId }),
        })
        if (!response.ok) {
            return { message: "Failed to accept friend request", status: response.status, intent: "acceptFriend" }
        }
        const result = await response.json()
        return { message: result.message, status: result.status, intent: "acceptFriend" }
    }

    if (intent === "declineFriend") {
        const response = await fetch(`${process.env.REST_API_URL}/friend`, {
            method: "DELETE", headers,
            body: JSON.stringify({ requestorId }),
        })
        if (!response.ok) {
            return { message: "Failed to decline friend request", status: response.status, intent: "declineFriend" }
        }
        const result = await response.json()
        return { message: result.message, status: result.status, intent: "declineFriend" }
    }

    return null
}

// ── Deterministic pastel color per user ──────────────────────
const AVATAR_COLORS = [
    "bg-green-100 text-green-700",
    "bg-blue-100 text-blue-700",
    "bg-orange-100 text-orange-700",
    "bg-pink-100 text-pink-700",
    "bg-purple-100 text-purple-700",
    "bg-amber-100 text-amber-700",
    "bg-teal-100 text-teal-700",
]
function avatarColor(id: string) {
    const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
    return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}
function initials(username: string) {
    return username.slice(0, 2).toUpperCase()
}

export default function AllFriends() {
    const { user, friends, pendingRequests } = useLoaderData<typeof loader>()
    const actionData = useActionData<typeof action>()

    const [activeTab, setActiveTab] = useState<"friends" | "requests">("friends")
    const [nameSearch, setNameSearch] = useState("")
    const [showAddForm, setShowAddForm] = useState(false)

    const filteredFriends = friends
        .filter(f => f.username.toLowerCase().includes(nameSearch.toLowerCase()))
        .sort((a, b) => a.username.localeCompare(b.username))

    return (
        <div className="max-w-3xl mx-auto px-4 py-10">

            {/* ── Header ── */}
            <div className="flex items-start justify-between mb-1">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Friends</h1>
                    <p className="text-sm text-gray-500 mt-1">See what your friends are cooking and share recipes.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAddForm(v => !v)}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors shrink-0"
                >
                    {showAddForm ? "✕ Cancel" : "+ Add friend"}
                </button>
            </div>

            {/* ── Add friend inline form ── */}
            {showAddForm && (
                <Form method="post" className="mt-4 p-4 border border-gray-200 rounded-xl bg-white flex flex-col sm:flex-row gap-3">
                    <input type="hidden" name="intent" value="sendFriendRequest" />
                    <input type="hidden" name="requestorId" value={user.id} />
                    <input
                        type="email"
                        name="email"
                        required
                        placeholder="Enter friend's email address"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />
                    <button
                        type="submit"
                        className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors shrink-0"
                    >
                        Send request
                    </button>
                </Form>
            )}
            {actionData && "intent" in actionData && actionData.intent === "sendFriendRequest" && actionData.message && (
                <p className={`mt-2 text-sm font-medium ${actionData.status === 200 ? "text-green-600" : "text-red-600"}`}>
                    {actionData.message}
                </p>
            )}

            {/* ── Tabs ── */}
            <div className="flex gap-2 mt-6">
                <button
                    type="button"
                    onClick={() => setActiveTab("friends")}
                    className={[
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                        activeTab === "friends"
                            ? "bg-gray-900 text-white"
                            : "border border-gray-200 text-gray-500 hover:bg-gray-50",
                    ].join(" ")}
                >
                    All friends
                    <span className={[
                        "text-xs font-semibold px-1.5 py-0.5 rounded-full",
                        activeTab === "friends" ? "bg-white text-gray-900" : "bg-gray-100 text-gray-600",
                    ].join(" ")}>
                        {friends.length}
                    </span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("requests")}
                    className={[
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                        activeTab === "requests"
                            ? "bg-gray-900 text-white"
                            : "border border-gray-200 text-gray-500 hover:bg-gray-50",
                    ].join(" ")}
                >
                    Requests
                    {pendingRequests.length > 0 && (
                        <span className={[
                            "text-xs font-semibold px-1.5 py-0.5 rounded-full",
                            activeTab === "requests" ? "bg-white text-gray-900" : "bg-gray-100 text-gray-600",
                        ].join(" ")}>
                            {pendingRequests.length}
                        </span>
                    )}
                </button>
            </div>

            {/* ── ALL FRIENDS TAB ── */}
            {activeTab === "friends" && (
                <>
                    <input
                        type="text"
                        value={nameSearch}
                        onChange={e => setNameSearch(e.target.value)}
                        placeholder="Search friends..."
                        className="mt-4 w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    />

                    {filteredFriends.length === 0 ? (
                        <p className="mt-8 text-center text-sm text-gray-400">
                            {nameSearch ? "No friends match your search." : "You have no friends yet. Click '+ Add friend' to get started!"}
                        </p>
                    ) : (
                        <div className="mt-4 border border-gray-200 rounded-2xl overflow-hidden">
                            {filteredFriends.map((friend, i) => (
                                <div
                                    key={friend.id}
                                    className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? "border-t border-gray-100" : ""}`}
                                >
                                    {/* Avatar */}
                                    <div className="relative w-10 h-10 shrink-0">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${avatarColor(friend.id)}`}>
                                            {initials(friend.username)}
                                        </div>
                                        <img
                                            src={`/api/avatar/${friend.id}`}
                                            alt={friend.username}
                                            className="absolute inset-0 w-10 h-10 rounded-full object-cover"
                                            onError={(imgEvent) => { imgEvent.currentTarget.style.display = 'none' }}
                                        />
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate">{friend.username}</p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Link
                                            to={`/friendprofile/${friend.id}`}
                                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                                        >
                                            View profile
                                        </Link>
                                        <Form method="post" className="inline">
                                            <input type="hidden" name="intent" value="declineFriend" />
                                            <input type="hidden" name="requestorId" value={friend.id} />
                                            <button
                                                type="submit"
                                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                            >
                                                Remove
                                            </button>
                                        </Form>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ── REQUESTS TAB ── */}
            {activeTab === "requests" && (
                <>
                    {actionData && "intent" in actionData && (actionData.intent === "acceptFriend" || actionData.intent === "declineFriend") && actionData.message && (
                        <p className={`mt-4 text-sm font-medium ${actionData.status === 200 ? "text-green-600" : "text-red-600"}`}>
                            {actionData.message}
                        </p>
                    )}

                    {pendingRequests.length === 0 ? (
                        <p className="mt-8 text-center text-sm text-gray-400">No pending friend requests.</p>
                    ) : (
                        <div className="mt-4 border border-gray-200 rounded-2xl overflow-hidden">
                            {pendingRequests.map((req, i) => (
                                <div
                                    key={req.id}
                                    className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? "border-t border-gray-100" : ""}`}
                                >
                                    {/* Avatar */}
                                    <div className="relative w-10 h-10 shrink-0">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${avatarColor(req.id)}`}>
                                            {initials(req.username)}
                                        </div>
                                        <img
                                            src={`/api/avatar/${req.id}`}
                                            alt={req.username}
                                            className="absolute inset-0 w-10 h-10 rounded-full object-cover"
                                            onError={(imgEvent) => { imgEvent.currentTarget.style.display = 'none' }}
                                        />
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate">{req.username}</p>
                                        <p className="text-xs text-gray-400 mt-0.5">Wants to be your friend</p>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Form method="post" className="inline">
                                            <input type="hidden" name="intent" value="acceptFriend" />
                                            <input type="hidden" name="requestorId" value={req.id} />
                                            <button
                                                type="submit"
                                                className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
                                            >
                                                Confirm
                                            </button>
                                        </Form>
                                        <Form method="post" className="inline">
                                            <input type="hidden" name="intent" value="declineFriend" />
                                            <input type="hidden" name="requestorId" value={req.id} />
                                            <button
                                                type="submit"
                                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                            >
                                                Decline
                                            </button>
                                        </Form>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
