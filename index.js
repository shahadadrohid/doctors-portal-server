const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// MiddleWare 
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.erqzilo.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
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
                const serviceBooking = bookings.filter(b => b.treatment === service.name)
                const booked = serviceBooking.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s))
                service.available = available;
                console.log(serviceBooking)
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