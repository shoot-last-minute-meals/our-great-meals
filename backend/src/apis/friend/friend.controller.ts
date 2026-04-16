import type {Request, Response} from "express";
import {serverErrorResponse, zodErrorResponse} from "../../utils/response.utils.ts";
import type {Status} from "../../utils/interfaces/Status.ts";
import {
    friendSchema,
    insertFriend,
    selectAcceptedFriendsByUserId,
    selectMutualFriendsByUserIds,
    selectPendingRequestsByUserId,
    updateFriendAccepted,
    deleteFriend,
    type Friend
} from "./friend.model.ts";
import {type PublicUser, selectPublicUserByEmail} from "../user/user.model.ts";
import {z} from "zod/v4";




export async function getFriendsController(request: Request, response: Response): Promise<void> {
    try {
        const user = request.session?.user
        if (!user) {
            response.json({status: 401, message: 'Please login to view friends', data: null})
            return
        }

        const friends: PublicUser[] = await selectAcceptedFriendsByUserId(user.id)
        const pendingRequests: PublicUser[] = await selectPendingRequestsByUserId(user.id)

        const status: Status = {
            status: 200,
            message: 'Friends retrieved successfully',
            data: {friends, pendingRequests}
        }
        response.json(status)
    } catch (error: any) {
        console.error(error)
        serverErrorResponse(response, error.message)
    }
}

export async function postFriendByEmailController(request: Request, response: Response): Promise<void> {
    try {
        const bodySchema = z.object({
            email: z.email('Please provide a valid email'),
            requestorId: z.uuidv7('Please provide a valid requestor id'),
        })

        const validationResult = bodySchema.safeParse(request.body)
        if (!validationResult.success) {
            zodErrorResponse(response, validationResult.error)
            return
        }

        const user = request.session?.user
        if (!user) {
            response.json({status: 401, message: 'Please login to send a friend request', data: null})
            return
        }
        if (validationResult.data.requestorId !== user.id) {
            response.json({status: 403, message: 'User Id does not match authenticated user', data: null})
            return
        }

        const foundUser = await selectPublicUserByEmail(validationResult.data.email)
        if (!foundUser) {
            response.json({status: 404, message: 'No user found with that email address', data: null})
            return
        }
        if (foundUser.id === user.id) {
            response.json({status: 400, message: 'You cannot send a friend request to yourself', data: null})
            return
        }

        const message = await insertFriend({
            requesteeId: foundUser.id,
            requestorId: user.id,
            accepted: false
        })

        const status: Status = {status: 200, message, data: null}
        response.json(status)
    } catch (error: any) {
        console.error(error)
        serverErrorResponse(response, error.message)
    }
}

export async function putFriendController(request: Request, response: Response): Promise<void> {
    try {
        const bodySchema = z.object({
            requestorId: z.uuidv7('Please provide a valid requestor id'),
        })
        const validationResult = bodySchema.safeParse(request.body)
        if (!validationResult.success) {
            zodErrorResponse(response, validationResult.error)
            return
        }
        const user = request.session?.user
        if (!user) {
            response.json({status: 401, message: 'Please login to accept friend request', data: null})
            return
        }
        const message = await updateFriendAccepted(user.id, validationResult.data.requestorId)
        response.json({status: 200, message, data: null})
    } catch (error: any) {
        console.error(error)
        serverErrorResponse(response, error.message)
    }
}

export async function deleteFriendController(request: Request, response: Response): Promise<void> {
    try {
        const bodySchema = z.object({
            requestorId: z.uuidv7('Please provide a valid requestor id'),
        })
        const validationResult = bodySchema.safeParse(request.body)
        if (!validationResult.success) {
            zodErrorResponse(response, validationResult.error)
            return
        }
        const user = request.session?.user
        if (!user) {
            response.json({status: 401, message: 'Please login to decline friend request', data: null})
            return
        }
        const message = await deleteFriend(user.id, validationResult.data.requestorId)
        response.json({status: 200, message, data: null})
    } catch (error: any) {
        console.error(error)
        serverErrorResponse(response, error.message)
    }
}

export async function getMutualFriendsController(request: Request, response: Response): Promise<void> {
    try {
        const user = request.session?.user
        if (!user) {
            response.json({status: 401, message: 'Please login to view mutual friends', data: null})
            return
        }
        const profileUserId = request.params.profileUserId
        const mutualFriends = await selectMutualFriendsByUserIds(user.id, profileUserId)
        const status: Status = {status: 200, message: 'Mutual friends retrieved successfully', data: {mutualFriends}}
        response.json(status)
    } catch (error: any) {
        console.error(error)
        serverErrorResponse(response, error.message)
    }
}

export async function postFriendController(request: Request, response: Response): Promise<void> {
    try {
        // validate the full recipe object from the request body
        const validationResult = friendSchema.safeParse(request.body)
        if (!validationResult.success) {
            zodErrorResponse(response, validationResult.error)
            return
        }
        const user = request.session?.user
        if (!user) {
            response.json({status: 401, message: 'Please login to create add friend', data: null})
            return
        }
        if (validationResult.data.requestorId !== user.id) {
            response.json({status: 403, message: 'User Id in request does not match authenticated friend', data: null})
            return
        }
        const message = await insertFriend(validationResult.data)

        const status: Status = {
            status: 200,
            message,
            data: null
        }
        response.json(status)
    } catch (error: any) {
        console.error(error)
        serverErrorResponse(response, error.message)
    }
}