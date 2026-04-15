import type { Route } from "./+types/login"
import {commitSession, getSession} from "~/utils/session.server";
import {Form, redirect, useActionData, useFetcher, useSearchParams} from "react-router";
import {zodResolver} from "@hookform/resolvers/zod";
import {postSignIn, type SignIn, SignInSchema} from "~/utils/models/sign-in.model";
import {postSignUp, SignUpUserSchema, type SignUpUser} from "~/utils/models/user.model";
import type {FormActionResponse} from "~/utils/interfaces/FormActionResponse";
import {getValidatedFormData, useRemixForm} from "remix-hook-form";
import {jwtDecode} from "jwt-decode";
import {UserSchema} from "~/utils/models/user.model";
import {FieldError} from "~/components/FieldError";
import {useEffect, useState} from "react";
import {StatusMessage} from "~/components/StatusMessage";
import {Logo} from "~/components/Logo";

export function meta({}: Route.MetaArgs) {
    return [
        { title: "Sign In — Last Minute Meals" },
        { name: "description", content: "Sign in or create an account to start cooking." },
    ];
}

export async function loader({ request }: Route.LoaderArgs) {
    const session = await getSession(request.headers.get('Cookie'))
    if (session.has('user')) {
        return redirect('/')
    }
}

const signInResolver = zodResolver(SignInSchema)
const signUpResolver = zodResolver(SignUpUserSchema)

export async function action({request}: Route.ActionArgs): Promise<FormActionResponse | Response> {
    const session = await getSession(request.headers.get('Cookie'))

    const intent = new URL(request.url).searchParams.get('intent')

    // Handle registration
    if (intent === 'register') {
        const {errors, data, receivedValues: defaultValues} = await getValidatedFormData<SignUpUser>(request, signUpResolver)

        if (errors) {
            return { errors, defaultValues, intent: 'register' }
        }

        const result = await postSignUp(data)

        if (result.status !== 201) {
            return { success: false, status: result, intent: 'register' }
        }

        return { success: true, status: result, intent: 'register' }
    }

    // Handle login (default intent)
    const {errors, data, receivedValues: defaultValues} = await getValidatedFormData<SignIn>(request, signInResolver)

    if(errors) {
        return {errors, defaultValues, intent: 'login'}
    }

    const {result, headers} = await postSignIn(data)
    const authorization = headers.get('authorization')
    const expressSessionCookie = headers.get('Set-Cookie')

    if(result.status !== 200 || !authorization) {
        return { success: false, status: result, intent: 'login' }
    }

    const parsedJwtToken = jwtDecode(authorization) as any
    const validationResult = UserSchema.safeParse(parsedJwtToken.auth)

    if (!validationResult.success) {
        console.log(validationResult.error)
        session.flash('error', 'user is malformed')
        return {
            success: false,
            status: {status: 400, data: null, message: 'sign in attempt failed try again'},
            intent: 'login'
        }
    }

    session.set('authorization', authorization)
    session.set('user', validationResult.data)
    session.set('ingredients', {})

    const responseHeaders = new Headers()
    responseHeaders.append('Set-Cookie', await commitSession(session))
    if (expressSessionCookie) {
        responseHeaders.append('Set-Cookie', expressSessionCookie)
    }

    const redirectTo = new URL(request.url).searchParams.get('redirectTo') ?? '/'
    return redirect(redirectTo, {headers: responseHeaders})
}

export default function Login() {
    const [searchParams] = useSearchParams()
    const redirectTo = searchParams.get('redirectTo') ?? '/'

    const [activeTab, setActiveTab] = useState<'login' | 'register'>('login')
    const [showPassword, setShowPassword] = useState(false)
    const [showRegisterPassword, setShowRegisterPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [rememberMe, setRememberMe] = useState(false)

    // Login: main route Form + useActionData — redirect on success works naturally
    const loginForm = useRemixForm<SignIn>({ mode: 'onSubmit', resolver: signInResolver })
    const loginActionData = useActionData<typeof action>() as FormActionResponse | undefined

    // Register: isolated fetcher — its data never bleeds into the login form
    const registerFetcher = useFetcher<typeof action>()
    const registerForm = useRemixForm<SignUpUser>({ mode: 'onSubmit', resolver: signUpResolver, fetcher: registerFetcher })
    const registerActionData = registerFetcher.data as FormActionResponse | undefined

    useEffect(() => {
        if (registerActionData?.success && registerActionData?.intent === 'register') {
            registerForm.reset()
        }
    }, [registerActionData])

    const inputClass = "block w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400 transition-colors"
    const inputErrorClass = "border-red-400 focus:ring-red-400 focus:border-red-400"
    const labelClass = "block text-sm font-medium text-gray-700 mb-1.5"

    const features = [
        'AI-powered ingredient recognition',
        'Hundreds of matched recipes',
        'Share meals with friends',
        'Track your cooking history',
    ]

    return (
        <div className="flex min-h-[calc(100vh-3.5rem)]">

            {/* ── Left panel ── */}
            <div className="hidden lg:flex lg:w-2/5 flex-col justify-between p-10 bg-[#2a2a27]">

                {/* Logo */}
                {/*<div className="flex items-center gap-3">*/}
                {/*    <Logo size={38} />*/}
                {/*    <span className="text-white font-semibold text-base tracking-tight">lastminutemeals</span>*/}
                {/*</div>*/}

                {/* Marketing copy */}
                <div className="space-y-6">
                    <h2 className="text-4xl font-bold text-white leading-tight">
                        Snap your fridge.<br />Cook something great.
                    </h2>
                    <p className="text-gray-400 text-base leading-relaxed">
                        Upload a photo of your ingredients and get recipe matches in seconds.
                    </p>
                    <ul className="space-y-3">
                        {features.map((item) => (
                            <li key={item} className="flex items-center gap-3 text-gray-300 text-sm">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Footer */}
                {/*<p className="text-gray-500 text-xs">© 2026 Last Minute Meals</p>*/}
            </div>

            {/* ── Right panel ── */}
            <div className="flex-1 flex flex-col justify-center px-8 py-12 sm:px-16 bg-white">
                <div className="w-full max-w-md mx-auto">

                    {/* Heading */}
                    <h1 className="text-3xl font-bold text-gray-900 mb-1">Welcome back</h1>
                    <p className="text-sm text-gray-500 mb-8">
                        No account?{' '}
                        <button
                            type="button"
                            onClick={() => setActiveTab('register')}
                            className="text-emerald-600 hover:text-emerald-700 font-medium hover:underline underline-offset-2 transition-colors"
                        >
                            Sign up free
                        </button>
                    </p>

                    {/* Tab switcher */}
                    <div className="flex rounded-lg bg-stone-100 p-1 mb-8 gap-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab('login')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-150 ${
                                activeTab === 'login'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Sign in
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('register')}
                            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-150 ${
                                activeTab === 'register'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            Create account
                        </button>
                    </div>

                    {/* ── Login Form ── */}
                    {activeTab === 'login' && (
                        <Form onSubmit={loginForm.handleSubmit} action={`?intent=login&redirectTo=${encodeURIComponent(redirectTo)}`} className="space-y-5" method="POST">

                            {/* Email */}
                            <div>
                                <label htmlFor="login-email" className={labelClass}>Email</label>
                                <input
                                    id="login-email"
                                    type="text"
                                    {...loginForm.register('email')}
                                    placeholder="you@example.com"
                                    className={`${inputClass} ${loginForm.formState.errors.email ? inputErrorClass : ''}`}
                                />
                                <FieldError error={loginForm.formState.errors} field="email" />
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="login-password" className={labelClass}>Password</label>
                                <div className="relative">
                                    <input
                                        id="login-password"
                                        {...loginForm.register('password')}
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Enter your password"
                                        className={`${inputClass} pr-14 ${loginForm.formState.errors.password ? inputErrorClass : ''}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        className="absolute inset-y-0 right-3 flex items-center text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                                    >
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <FieldError error={loginForm.formState.errors} field="password" />
                            </div>

                            {/* Remember me + Forgot password */}
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={e => setRememberMe(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 accent-emerald-600"
                                    />
                                    <span className="text-sm text-gray-600">Remember me</span>
                                </label>
                                <button
                                    type="button"
                                    className="text-sm text-emerald-600 hover:text-emerald-700 hover:underline underline-offset-2 transition-colors"
                                >
                                    Forgot password?
                                </button>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                            >
                                Sign in
                            </button>

                            <StatusMessage actionData={loginActionData} />
                        </Form>
                    )}

                    {/* ── Register Form ── */}
                    {activeTab === 'register' && (
                        <Form onSubmit={registerForm.handleSubmit} action="?intent=register" className="space-y-5" method="POST">

                            {/* Username */}
                            <div>
                                <label htmlFor="reg-username" className={labelClass}>Username</label>
                                <input
                                    id="reg-username"
                                    type="text"
                                    {...registerForm.register('username')}
                                    placeholder="Your username"
                                    className={`${inputClass} ${registerForm.formState.errors.username ? inputErrorClass : ''}`}
                                />
                                <FieldError error={registerForm.formState.errors} field="username" />
                            </div>

                            {/* Email */}
                            <div>
                                <label htmlFor="reg-email" className={labelClass}>Email</label>
                                <input
                                    id="reg-email"
                                    type="text"
                                    {...registerForm.register('email')}
                                    placeholder="you@example.com"
                                    className={`${inputClass} ${registerForm.formState.errors.email ? inputErrorClass : ''}`}
                                />
                                <FieldError error={registerForm.formState.errors} field="email" />
                            </div>

                            {/* Password */}
                            <div>
                                <label htmlFor="reg-password" className={labelClass}>Password</label>
                                <div className="relative">
                                    <input
                                        id="reg-password"
                                        {...registerForm.register('password')}
                                        type={showRegisterPassword ? 'text' : 'password'}
                                        placeholder="Min. 8 characters"
                                        className={`${inputClass} pr-14 ${registerForm.formState.errors.password ? inputErrorClass : ''}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowRegisterPassword(v => !v)}
                                        className="absolute inset-y-0 right-3 flex items-center text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                                    >
                                        {showRegisterPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <FieldError error={registerForm.formState.errors} field="password" />
                            </div>

                            {/* Confirm password */}
                            <div>
                                <label htmlFor="reg-password-confirm" className={labelClass}>Confirm password</label>
                                <div className="relative">
                                    <input
                                        id="reg-password-confirm"
                                        {...registerForm.register('passwordConfirm')}
                                        type={showConfirmPassword ? 'text' : 'password'}
                                        placeholder="Repeat password"
                                        className={`${inputClass} pr-14 ${registerForm.formState.errors.passwordConfirm ? inputErrorClass : ''}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(v => !v)}
                                        className="absolute inset-y-0 right-3 flex items-center text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
                                    >
                                        {showConfirmPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                                <FieldError error={registerForm.formState.errors} field="passwordConfirm" />
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                className="w-full py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
                            >
                                Create account
                            </button>

                            <StatusMessage actionData={registerActionData} />
                        </Form>
                    )}

                </div>
            </div>
        </div>
    )
}
