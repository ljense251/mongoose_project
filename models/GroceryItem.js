const mongoose = require('mongoose');

const grocerySchema = new mongoose.Schema({
    item: {
        type: String,
        required: [true, 'item requires a string value']
    },
    food_group: {
        type: String,
        required: [true, 'food_group is required'],
        enum: ['proteins', 'dairy', 'fruits', 'vegetables',
            'nuts', 'grains', 'meat']
    },
    price_in_usd: {
        type: Number,
        required: [true, 'price_in_usd requires a numerical value'],
        min: [0, 'please enter a positive value']
    },


});

module.exports = mongoose.model('GroceryItem', grocerySchema)