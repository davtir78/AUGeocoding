import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Firebase Admin (idempotent)
if (!admin.apps?.length) {
    admin.initializeApp();
}
const firestore = admin.firestore();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const stripe = new Stripe(STRIPE_SECRET_KEY || 'deployment_dummy_key', {
    apiVersion: '2025-01-27' as any, // Use latest stable
});

/**
 * createCheckoutSession
 * POST { amount, userId, successUrl, cancelUrl }
 */
export const createCheckoutSession = onRequest(
    {
        region: 'us-central1', // Match project region
        cors: true,
        secrets: ['STRIPE_SECRET_KEY']
    },
    async (req, res) => {
        if (req.method !== 'POST') {
            res.status(405).send('Method Not Allowed');
            return;
        }

        const { amount, userId, successUrl, cancelUrl } = req.body;

        if (!amount || !userId) {
            res.status(400).send('Missing amount or userId');
            return;
        }

        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
                            product_data: {
                                name: 'Scholar\'s Alley Gold Credits',
                                description: `Purchase of ${amount} Gold Credits`,
                            },
                            unit_amount: 100, // $1.00 for demo, in real life maybe amount * scale
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                client_reference_id: userId,
                success_url: successUrl || 'http://localhost:3000/success',
                cancel_url: cancelUrl || 'http://localhost:3000/cancel',
                metadata: {
                    credits: amount.toString()
                }
            });

            res.status(200).json({ id: session.id, url: session.url });
        } catch (error: any) {
            logger.error('Error creating checkout session', error);
            res.status(500).send(error.message);
        }
    }
);

/**
 * handleStripeWebhook
 * Stripe webhook handler to process checkout.session.completed
 */
export const handleStripeWebhook = onRequest(
    {
        region: 'us-central1',
        secrets: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']
    },
    async (req, res) => {
        const sig = req.headers['stripe-signature'];

        if (!sig || !STRIPE_WEBHOOK_SECRET) {
            res.status(400).send('Webhook Error: Missing signature or secret');
            return;
        }

        let event;

        try {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET);
        } catch (err: any) {
            logger.error('Webhook signature verification failed', err);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.client_reference_id;
            const creditsToAdd = parseInt(session.metadata?.credits || '0');

            if (userId && creditsToAdd > 0) {
                try {
                    const userRef = firestore.collection('userProfiles').doc(userId);
                    await firestore.runTransaction(async (transaction) => {
                        const userDoc = await transaction.get(userRef);
                        if (!userDoc.exists) {
                            throw new Error('User does not exist');
                        }
                        const currentCredits = userDoc.data()?.credits || 0;
                        transaction.update(userRef, {
                            credits: currentCredits + creditsToAdd,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    });
                    logger.info(`Successfully added ${creditsToAdd} credits to user ${userId}`);
                } catch (error) {
                    logger.error('Error updating user credits via webhook', error);
                    res.status(500).send('Error updating user credits');
                    return;
                }
            }
        }

        res.status(200).json({ received: true });
    }
);
