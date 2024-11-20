const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// import the collection models
const GroceryItem = require('./models/GroceryItem');
const Employee = require('./models/Employee');
// create a mapping object based on the models
const modelMapping = {
    GroceryInventory: GroceryItem,
    Employees: Employee
};

const connections = {};
const models = {};

const getConnection = async (dbName) => {
    console.log(`getConnection called with ${dbName}`);

    if (!connections[dbName]) {
        connections[dbName] = await mongoose.createConnection(process.env.MONGO_URI, { dbName: dbName, autoIndex: false });
        // Await the 'open' event to ensure the connection is established
        await new Promise((resolve, reject) => {
            connections[dbName].once('open', resolve);
            connections[dbName].once('error', reject);
        });
        console.log(`Connected to database ${dbName}`);
    } else {
        console.log('Reusing existing connection for db', dbName);
    }
    return connections[dbName];
};

const getModel = async (dbName, collectionName) => {
    console.log("getModel called with:", { dbName, collectionName });
    const modelKey = `${dbName}-${collectionName}`;

    if (!models[modelKey]) {
        const connection = await getConnection(dbName);
        const Model = modelMapping[collectionName];

        if (!Model) {
            // Use a dynamic schema if no model is found
            const dynamicSchema = new mongoose.Schema({}, { strict: false, autoIndex: false });
            models[modelKey] = connection.model(
                collectionName,
                dynamicSchema,
                collectionName
            );
            console.log(`Created dynamic model for collection: ${collectionName}`);
        } else {
            models[modelKey] = connection.model(
                Model.modelName,
                Model.schema,
                collectionName  // Use exact collection name from request
            );
            console.log("Created new model for collection:", collectionName);
        }
    }

    return models[modelKey];
};

app.get('/find/:database/:collection', async (req, res) => {
    try {
        // Extract the database and collection from request parameters
        const { database, collection } = req.params;
        // Get the appropriate Mongoose model
        const Model = await getModel(database, collection);
        // Retrieve all documents from the collection
        const documents = await Model.find({});
        // Log the number of documents retrieved
        console.log(`query executed, document count is: ${documents.length}`);
        // Send back the documents with a 200 status code
        res.status(200).json(documents);
    }
    catch (err) {
        // Log error to the console
        console.error('Error in GET route', err);
        // Send back a 500 status code with the error message
        res.status(500).json({ error: err.message });
    }
});

app.post('/insert/:database/:collection', async (req, res) => {
    try {
        // Extract the request parameters using destructuring
        const { database, collection } = req.params;
        // Get the request body and store it as data
        const data = req.body;
        // Get the appropriate Mongoose model
        const Model = await getModel(database, collection);
        // Create a new instance of that model with the data
        const newDocument = new Model(data)
        // Save the new document to the database
        await newDocument.save()
        // Log a success message to the console
        console.log(`document was saved to collection ${collection}`);
        // Send back the newly created document as JSON with a 201 status code
        res.status(201).json({ message: "document was created successfully", document: newDocument });
    } catch (err) {
        // Log any errors to the console
        console.error('there was a problem creating new document', err);
        // Send back a 400 status code and the error message in the response
        res.status(400).json({ error: err.message })
    }
});

app.put('/update/:database/:collection/:id', async (req, res) => {
    try {
        // cache the req.params through destructuring
        const { database, collection, id } = req.params;
        // cache the req.body as the const data
        const data = req.body;
        // cache the returned model as Model
        const Model = await getModel(database, collection);
        // cache the returned updated document using the .findByIdAndUpdate() method
        const updatedDocument = await Model.findByIdAndUpdate(id, data, { new: true, runValidators: true });
        // log document with id was updated successfully
        console.log(`Document with id: ${id} was updated successfully`);
        // if document was not found early return with a 404 status and error message
        if (!updatedDocument) {
            return res.status(404).json({ error: "Document not found" });
        }
        // otherwise respond with a 200 status code and send back the jsonified updated Document
        res.status(200).json(updatedDocument);
    } catch (err) {
        // if there was an error return a bad request status and log the error to the console
        console.error(`Therer was an error in the PUT route`, err);
        res.status(400).json({ error: err.message });
    }
});
// delete route
app.delete('/delete/:database/:collection/:id', async (req, res) => {
    try {
        // Extract the database, collection, and id from request parameters
        const { database, collection, id } = req.params;
        // Get the appropriate Mongoose model
        const Model = await getModel(database, collection);
        // Find and delete the document by id
        const deletedDocument = await Model.findByIdAndDelete(id);
        // If document not found, return 404 status code with error message
        if (!deletedDocument) {
            return res.status(404).json({ error: "Document not found" });
        }
        // Log success message to the console
        console.log(`document with id: ${id} deleted successfully`);
        // Send back a success message with a 200 status code
        res.status(200).json({ message: `Document with id: ${id} deleted successfully` });
    } catch (err) {
        // Log error to the console
        console.error("Error with delete route", err);
        // Send back a 400 status code with the error message
        res.status(400).json({ error: err.message })
    }
});
// Insert MANY route
app.post('/insert-many/:database/:collection', async (req, res) => {
    try {
        // Extract the database and collection from request parameters
        const { database, collection } = req.params;
        // Get the array of documents from request body
        const documents = req.body;

        // Validate that the request body is an array
        if (!Array.isArray(documents)) {
            return res.status(400).json({
                error: "Request body must be an array of documents"
            });
        }

        // Get the appropriate Mongoose model
        const Model = await getModel(database, collection);

        // Insert many documents at once
        const result = await Model.insertMany(documents, {
            ordered: true,  // Set to false if you want to continue inserting even if some documents fail
            runValidators: true
        });

        // Log success message
        console.log(`${result.length} documents were saved to collection ${collection}`);

        // Send back response with inserted count
        res.status(201).json({
            message: `Successfully inserted ${result.length} documents`,
            insertedCount: result.length
        });
    } catch (err) {
        console.error('Error inserting documents:', err);
        res.status(400).json({ error: err.message });
    }
});
// DELETE route to delete a specific collection in a database
app.delete('/delete-collection/:database/:collection', async (req, res) => {
    try {
        const { database, collection } = req.params;
        const connection = await getConnection(database); // Establish or retrieve the connection

        // Check if the collection exists
        const collections = await connection.db.listCollections({ name: collection }).toArray();
        const collectionExists = collections.length > 0;

        if (!collectionExists) {
            return res.status(404).json({ error: `Collection '${collection}' does not exist in database '${database}'.` });
        }

        // Drop the collection
        await connection.db.dropCollection(collection);
        console.log(`Collection '${collection}' deleted from database '${database}'.`);

        // Remove all models associated with this collection
        const modelKey = `${database}-${collection}`;
        delete models[modelKey];

        res.status(200).json({ message: `Collection '${collection}' has been successfully deleted from database '${database}'.` });
    } catch (err) {
        console.error('Error deleting collection:', err);
        res.status(500).json({ error: 'An error occurred while deleting the collection.' });
    }
});


async function startServer() {
    try {
        app.listen(port, () => {
            console.log(`server is listening on ${port}`);
        })
    }
    catch (error) {
        console.error('error starting the server');
        process.exit(1);
    }
}

startServer();