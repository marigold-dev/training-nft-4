import { InfoOutlined } from "@mui/icons-material";
import SellIcon from "@mui/icons-material/Sell";

import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardMedia,
  ImageList,
  InputAdornment,
  Pagination,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import Paper from "@mui/material/Paper";
import { Stack } from "@mui/system";
import BigNumber from "bignumber.js";
import { useFormik } from "formik";
import { useSnackbar } from "notistack";
import React, { Fragment, useEffect, useState } from "react";
import * as yup from "yup";
import { UserContext, UserContextType } from "./App";
import ConnectButton from "./ConnectWallet";
import { TransactionInvalidBeaconError } from "./TransactionInvalidBeaconError";
import { address, nat } from "./type-aliases";

const itemPerPage: number = 6;

const validationSchema = yup.object({
  price: yup
    .number()
    .required("Price is required")
    .positive("ERROR: The number must be greater than 0!"),
  quantity: yup
    .number()
    .required("Quantity is required")
    .positive("ERROR: The number must be greater than 0!"),
});

type Offer = {
  price: nat;
  quantity: nat;
};

export default function OffersPage() {
  const [selectedTokenId, setSelectedTokenId] = React.useState<number>(0);
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(1);

  let [offersTokenIDMap, setOffersTokenIDMap] = React.useState<Map<nat, Offer>>(
    new Map()
  );
  let [ledgerTokenIDMap, setLedgerTokenIDMap] = React.useState<Map<nat, nat>>(
    new Map()
  );

  const {
    nftContrat,
    nftContratTokenMetadataMap,
    userAddress,
    storage,
    refreshUserContextOnPageReload,
    Tezos,
    setUserAddress,
    setUserBalance,
    wallet,
  } = React.useContext(UserContext) as UserContextType;

  const { enqueueSnackbar } = useSnackbar();

  const formik = useFormik({
    initialValues: {
      price: 0,
      quantity: 1,
    },
    validationSchema: validationSchema,
    onSubmit: (values) => {
      console.log("onSubmit: (values)", values, selectedTokenId);
      sell(selectedTokenId, values.quantity, values.price);
    },
  });

  const initPage = async () => {
    if (storage) {
      console.log("context is not empty, init page now");
      ledgerTokenIDMap = new Map();
      offersTokenIDMap = new Map();

      await Promise.all(
        storage.owner_token_ids.map(async (element) => {
          if (element[0] === userAddress) {
            const ownerBalance = await storage.ledger.get({
              0: userAddress as address,
              1: element[1],
            });
            if (ownerBalance != BigNumber(0))
              ledgerTokenIDMap.set(element[1], ownerBalance);
            const ownerOffers = await storage.offers.get({
              0: userAddress as address,
              1: element[1],
            });
            if (ownerOffers && ownerOffers.quantity != BigNumber(0))
              offersTokenIDMap.set(element[1], ownerOffers);

            console.log(
              "found for " +
                element[0] +
                " on token_id " +
                element[1] +
                " with balance " +
                ownerBalance
            );
          } else {
            console.log("skip to next owner");
          }
        })
      );
      setLedgerTokenIDMap(new Map(ledgerTokenIDMap)); //force refresh
      setOffersTokenIDMap(new Map(offersTokenIDMap)); //force refresh

      console.log("ledgerTokenIDMap", ledgerTokenIDMap);
    } else {
      console.log("context is empty, wait for parent and retry ...");
    }
  };

  useEffect(() => {
    (async () => {
      console.log("after a storage changed");
      await initPage();
    })();
  }, [storage]);

  useEffect(() => {
    (async () => {
      console.log("on Page init");
      await initPage();
    })();
  }, []);

  const sell = async (token_id: number, quantity: number, price: number) => {
    try {
      const op = await nftContrat?.methods
        .sell(
          BigNumber(token_id) as nat,
          BigNumber(quantity) as nat,
          BigNumber(price * 1000000) as nat //to mutez
        )
        .send();

      await op?.confirmation(2);

      enqueueSnackbar(
        "Wine collection (token_id=" +
          token_id +
          ") offer for " +
          quantity +
          " units at price of " +
          price +
          " XTZ",
        { variant: "success" }
      );

      refreshUserContextOnPageReload(); //force all app to refresh the context
    } catch (error) {
      console.table(`Error: ${JSON.stringify(error, null, 2)}`);
      let tibe: TransactionInvalidBeaconError =
        new TransactionInvalidBeaconError(error);
      enqueueSnackbar(tibe.data_message, {
        variant: "error",
        autoHideDuration: 10000,
      });
    }
  };

  return (
    <Paper>
      <Typography variant="h5">Sell my bottles</Typography>

      {ledgerTokenIDMap && ledgerTokenIDMap.size != 0 ? (
        <Fragment>
          <ImageList cols={itemPerPage / 2}>
            {Array.from(ledgerTokenIDMap.entries())
              .filter((_, index) =>
                index >= currentPageIndex * itemPerPage - itemPerPage &&
                index < currentPageIndex * itemPerPage
                  ? true
                  : false
              )
              .map(([token_id, balance]) => (
                <Card key={token_id + "-" + token_id.toString()}>
                  <CardHeader
                    avatar={
                      <Tooltip
                        title={
                          <Box>
                            <Typography>
                              {" "}
                              {"ID : " + token_id.toString()}{" "}
                            </Typography>
                            <Typography>
                              {"Description : " +
                                nftContratTokenMetadataMap.get(
                                  token_id.toNumber()
                                )?.description}
                            </Typography>
                          </Box>
                        }
                      >
                        <InfoOutlined />
                      </Tooltip>
                    }
                    title={
                      nftContratTokenMetadataMap.get(token_id.toNumber())?.name
                    }
                  />
                  <CardMedia
                    sx={{ width: "auto", marginLeft: "33%" }}
                    component="img"
                    height="100px"
                    image={nftContratTokenMetadataMap
                      .get(token_id.toNumber())
                      ?.thumbnailUri?.replace(
                        "ipfs://",
                        "https://gateway.pinata.cloud/ipfs/"
                      )}
                  />

                  <CardContent>
                    <Box>
                      <Typography variant="body2">
                        {"Owned : " + balance.toNumber()}
                      </Typography>
                      <Typography variant="body2">
                        {"Traded : " +
                          offersTokenIDMap.get(token_id)?.quantity +
                          " (price : " +
                          offersTokenIDMap
                            .get(token_id)
                            ?.price.dividedBy(1000000) +
                          " Tz/b)"}
                      </Typography>
                    </Box>
                  </CardContent>

                  <CardActions>
                    {!userAddress ? (
                      <Box marginLeft="5vw">
                        <ConnectButton
                          Tezos={Tezos}
                          nftContratTokenMetadataMap={
                            nftContratTokenMetadataMap
                          }
                          setUserAddress={setUserAddress}
                          setUserBalance={setUserBalance}
                          wallet={wallet}
                        />
                      </Box>
                    ) : (
                      <form
                        style={{ width: "100%" }}
                        onSubmit={(values) => {
                          setSelectedTokenId(token_id.toNumber());
                          formik.handleSubmit(values);
                        }}
                      >
                        <span>
                          <TextField
                            sx={{ width: "40%" }}
                            name="price"
                            label="price/bottle"
                            placeholder="Enter a price"
                            variant="filled"
                            value={formik.values.price}
                            onChange={formik.handleChange}
                            error={
                              formik.touched.price &&
                              Boolean(formik.errors.price)
                            }
                            helperText={
                              formik.touched.price && formik.errors.price
                            }
                          />
                          <TextField
                            sx={{
                              width: "60%",
                              bottom: 0,
                              position: "relative",
                            }}
                            label="quantity"
                            name="quantity"
                            placeholder="Enter a quantity"
                            variant="filled"
                            value={formik.values.quantity}
                            onChange={formik.handleChange}
                            error={
                              formik.touched.quantity &&
                              Boolean(formik.errors.quantity)
                            }
                            helperText={
                              formik.touched.quantity && formik.errors.quantity
                            }
                            InputProps={{
                              endAdornment: (
                                <InputAdornment position="end">
                                  <Button
                                    type="submit"
                                    aria-label="add to favorites"
                                  >
                                    <SellIcon /> Sell
                                  </Button>
                                </InputAdornment>
                              ),
                            }}
                          />
                        </span>
                      </form>
                    )}
                  </CardActions>
                </Card>
              ))}{" "}
          </ImageList>
          <Stack marginLeft="33%" bottom="2vh" position="absolute" spacing={2}>
            <Pagination
              page={currentPageIndex}
              onChange={(_, value) => setCurrentPageIndex(value)}
              count={Math.ceil(
                Array.from(ledgerTokenIDMap.entries()).length / itemPerPage
              )}
              showFirstButton
              showLastButton
            />
          </Stack>
        </Fragment>
      ) : (
        <Fragment />
      )}
    </Paper>
  );
}
