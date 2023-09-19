const db = require("../sequelize/models");

const transactionController = {
  async getTransactionByDateRange(req, res) {},

  async getProductByTransaction(req, res) {
    try {
      const response = await db.Transaction.findByPk(req.params.id, {
        include: [
          { model: db.TransactionDetail, include: [{ model: db.Product }] },
        ],
      });

      return res.send(response);
    } catch (error) {
      res.send(error.message);
    }
  },

  async createTransaction(req, res) {
    let transaction;
    const t = await db.sequelize.transaction();

    try {
      const productsBought = req.body.products; // Array of Product

      /*       // proteksi stok product 0
      if (productsBought.length === 0) {
        await t.rollback();
        return res.status(400).send("No products to create a transaction.");
      } */

      // Step 2: Create a transaction record with total_price
      transaction = await db.Transaction.create(
        {
          total_price: 0, // calculate later
        },
        { transaction: t }
      );

      // Step 3: Collect products bought and create transaction details
      const transactionDetails = [];
      for (const product of productsBought) {
        const productInfo = await db.Product.findByPk(product.id);
        // Ensure that the product exists and has a price
        if (!productInfo || !productInfo.price) {
          await t.rollback();
          return res.status(400).send("No products to create a transaction.");
        }

        // proteksi stock 0
        if (productInfo.stock < 1) {
          await t.rollback();
          return res
            .status(400)
            .send(`Product "${productInfo.name}" is out of stock.`);
        }

        // Calculate the unit price based on the product's price
        const unitPrice = productInfo.price;

        const transactionDetail = await db.TransactionDetail.create(
          {
            transaction_id: transaction.id,
            product_id: product.id,
            quantity: product.quantity,
            unit_price: unitPrice,
          },
          { transaction: t }
        );

        transactionDetails.push(transactionDetail);

        // Step 4: Decrease stock for each product
        await db.Product.update(
          { stock: db.sequelize.literal(`stock - ${product.quantity}`) },
          { where: { id: product.id }, transaction: t }
        );
      }

      // Calculate total price based on the sum of product prices
      const totalProductSold = await db.TransactionDetail.findAll({
        where: { transaction_id: transaction.id },
        include: [{ model: db.Product, as: "product" }],
        transaction: t,
      });

      // Calculate total price in table transaction from transactiondetails
      const totalPrice = totalProductSold.reduce((total, productDetail) => {
        const unitPrice = productDetail.unit_price;
        const quantity = productDetail.quantity;
        return total + unitPrice * quantity;
      }, 0);

      // Update the transaction record with the total price
      await transaction.update({ total_price: totalPrice }, { transaction: t });

      // Commit the transaction if everything is successful
      await t.commit();

      return res.send({
        transaction: transaction,
        totalProductSold: totalProductSold,
        totalPrice: totalPrice,
      });
    } catch (error) {
      await t.rollback();
      res.send(error?.message);
    }
  },
};

module.exports = transactionController;
