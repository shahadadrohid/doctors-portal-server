const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// MiddleWare 
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.erqzilo.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

/* ----------------------------------------------------
---------------- Verify Json Web Token ----------------
----------------------------------------------------*/
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' })
    }
    else {
        const token = authHeader.split(' ')[1]
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
            if (err) {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            else {
                // console.log(decoded)
                req.decoded = decoded;
                next();
            }
        })
    }
}

async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorsCollection = client.db('doctors_portal').collection('doctors');
        const paymentsCollection = client.db('doctors_portal').collection('payments');

        /* ----------------------------------------------------
        ---------------- Verify Admin ----------------
        ----------------------------------------------------*/
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            console.log(requester)
            const requesterAccount = await userCollection.findOne({ email: requester });
            console.log(requesterAccount)
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' })
            }
        }

        /* ----------------------------------------------------
        ---- Update Users information and create jwt token ----
        ----------------------------------------------------*/
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '12h' })
            res.send({ result, token });
        })

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users)
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        /* ----------------------------------------------------
        ---------------- Make Admin ----------------
        ---------------------------------------------------- */
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        /* ----------------------------------------------------
        ---------------- Create payment intent ----------------
        ----------------------------------------------------*/

        app.post('/create-payment-intent', async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'Feb 7, 2023';

            // Get all services data
            const services = await servicesCollection.find().toArray();

            // Get the booking of that day
            const bookings = await bookingCollection.find({ date: date }).toArray()

            services.forEach(service => {
                const serviceBooking = bookings.filter(book => book.treatment === service.name)
                const booked = serviceBooking.map(book => book.slot);
                const available = service.slots.filter(slot => !booked.includes(slot))
                service.slots = available;
                // console.log(serviceBooking) 
            })

            res.send(services)
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exixts = await bookingCollection.findOne(query)
            if (exixts) {
                return res.send({ success: false, booking: exixts });
            }
            else {
                const result = await bookingCollection.insertOne(booking);
                res.send({ success: true, result });
            }
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            // console.log(decodedEmail)
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                // console.log(bookings)                         
                res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' })
            }
        })

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking)
        })

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                }
            }
            const result = await paymentsCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedDoc)
        })

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await doctorsCollection.find().toArray();
            res.send(result);
        })

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            // console.log(doctor)
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        })

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })
    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Running Doctors portal Server')
})
app.listen(port, () => {
    console.log(`Doctors portal listening on port ${port}`)
})