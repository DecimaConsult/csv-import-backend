import mongoose from "mongoose";

// ✅ Export Eiffel connection
export let eiffelConnection = null;

/**
 * Connect to MongoDB databases
 */
const connectDatabase = async () => {
  try {
    const mainUri = process.env.MONGODB_URI;
    const eiffelUri = process.env.MONGODB_URI_EIFFEL;

    if (!mainUri) {
      throw new Error("❌ MONGODB_URI is not defined");
    }

    // ================================
    // ✅ CONNECT MAIN DATABASE
    // ================================
    await mongoose.connect(mainUri);
    await mongoose.connection.asPromise();

    console.log(
      `✅ Main DB connected → ${mongoose.connection.host}/${mongoose.connection.name}`,
    );

    // ================================
    // ✅ CONNECT EIFFEL DATABASE
    // ================================
    if (eiffelUri) {
      eiffelConnection = mongoose.createConnection(eiffelUri);

      await eiffelConnection.asPromise();

      console.log(
        `✅ Eiffel DB connected → ${eiffelConnection.host}/${eiffelConnection.name}`,
      );

      // Eiffel DB events
      eiffelConnection.on("error", (err) => {
        console.error("❌ Eiffel DB error:", err.message);
      });

      eiffelConnection.on("disconnected", () => {
        console.warn("⚠️ Eiffel DB disconnected");
      });
    } else {
      console.warn("⚠️ MONGODB_URI_EIFFEL not provided");
    }

    // ================================
    // ✅ MAIN DB EVENTS
    // ================================
    mongoose.connection.on("error", (err) => {
      console.error("❌ Main DB error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ Main DB disconnected");
    });

    // ================================
    // ✅ FINAL STATUS LOG
    // ================================
    console.log("🚀 All database connections initialized successfully");

    // ================================
    // ✅ GRACEFUL SHUTDOWN
    // ================================
    process.on("SIGINT", async () => {
      await mongoose.connection.close();

      if (eiffelConnection) {
        await eiffelConnection.close();
      }

      console.log("🔌 MongoDB connections closed");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDatabase;
